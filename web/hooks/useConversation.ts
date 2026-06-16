"use client";

import { useCallback, useReducer, useRef } from "react";
import { initialState, reducer } from "@/lib/conversationMachine";
import { encodeWAV, playBase64Audio } from "@/lib/audio";
import { useMicVAD } from "@/hooks/useMicVAD";
import type { LanguagePair, TranslateResult, Turn } from "@/lib/types";

const SAMPLE_RATE = 16000;
const HISTORY_WINDOW = 6; // turnos enviados como contexto

export function useConversation() {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Espelhos em ref para uso dentro do callback do VAD (sem stale closure).
  const phaseRef = useRef(state.phase);
  phaseRef.current = state.phase;
  const pairRef = useRef<LanguagePair | undefined>(state.pair);
  pairRef.current = state.pair;
  const turnsRef = useRef<Turn[]>(state.turns);
  turnsRef.current = state.turns;
  const mutedRef = useRef(state.muted);
  mutedRef.current = state.muted;

  const handleSpeech = useCallback(async (audio: Float32Array) => {
    const wav = encodeWAV(audio, SAMPLE_RATE);

    // Fase SETUP: a primeira fala define os idiomas.
    if (phaseRef.current === "SETUP") {
      try {
        dispatch({ type: "SET_STATUS", status: "configurando idiomas…" });
        const fd = new FormData();
        fd.append("audio", wav, "setup.wav");
        const res = await fetch("/api/setup-languages", { method: "POST", body: fd });
        if (!res.ok) throw new Error("Não entendi os idiomas, repita.");
        const pair = (await res.json()) as LanguagePair;
        dispatch({ type: "LANGUAGES_SET", pair });
      } catch (e) {
        dispatch({ type: "SET_STATUS", status: e instanceof Error ? e.message : "erro no setup" });
      }
      return;
    }

    // Fase ACTIVE: traduz a fala.
    if (phaseRef.current === "ACTIVE" && pairRef.current) {
      try {
        dispatch({ type: "SET_STATUS", status: "traduzindo…" });
        const fd = new FormData();
        fd.append("audio", wav, "fala.wav");
        fd.append("pair", JSON.stringify(pairRef.current));
        fd.append("history", JSON.stringify(turnsRef.current.slice(-HISTORY_WINDOW)));
        const res = await fetch("/api/translate", { method: "POST", body: fd });
        if (!res.ok) throw new Error("Falha na tradução.");
        const r = (await res.json()) as TranslateResult;

        dispatch({
          type: "ADD_TURNS",
          turns: [
            { role: "original", lang: r.sourceLang, text: r.sourceText },
            { role: "translation", lang: r.targetLang, text: r.targetText },
          ],
        });
        dispatch({ type: "SET_STATUS", status: "ouvindo" });
        if (!mutedRef.current) {
          dispatch({ type: "SET_STATUS", status: "falando…" });
          await playBase64Audio(r.audioBase64);
          dispatch({ type: "SET_STATUS", status: "ouvindo" });
        }
      } catch (e) {
        dispatch({ type: "SET_STATUS", status: e instanceof Error ? e.message : "erro" });
      }
    }
  }, []);

  const { listening, start, stop } = useMicVAD(handleSpeech);

  const begin = useCallback(async () => {
    dispatch({ type: "BEGIN" });
    try {
      await start();
    } catch {
      // Permissão de microfone negada ou VAD indisponível.
      dispatch({
        type: "ERROR",
        error: "Não consegui acessar o microfone. Permita o acesso e tente de novo.",
      });
    }
  }, [start]);

  const reset = useCallback(() => {
    stop();
    dispatch({ type: "RESET" });
  }, [stop]);

  const toggleMute = useCallback(() => dispatch({ type: "TOGGLE_MUTE" }), []);

  return { state, listening, begin, reset, toggleMute };
}
