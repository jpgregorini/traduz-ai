"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { initialState, reducer } from "@/lib/conversationMachine";
import { encodeWAV, playBase64Audio } from "@/lib/audio";
import { mergeGlossary, formatGlossary } from "@/lib/glossary";
import { createBusyGate } from "@/lib/guard";
import { loadSession, saveSession, clearSession } from "@/lib/session";
import { playWithVadGuard } from "@/lib/playback";
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
  const glossaryRef = useRef(state.glossary);
  glossaryRef.current = state.glossary;

  // Porta de exclusão: descarta falas que chegam durante processamento ativo.
  const gateRef = useRef(createBusyGate());

  // Reidrata a sessão salva (par, turnos, glossário) ao montar.
  useEffect(() => {
    const saved = loadSession();
    if (saved) {
      dispatch({ type: "HYDRATE", pair: saved.pair, turns: saved.turns, glossary: saved.glossary });
    }
  }, []);

  // Persiste sempre que par/turnos/glossário mudarem em sessão ativa.
  useEffect(() => {
    if (state.phase === "ACTIVE" && state.pair) {
      saveSession({ pair: state.pair, turns: state.turns, glossary: state.glossary });
    }
  }, [state.phase, state.pair, state.turns, state.glossary]);

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
      if (!gateRef.current.tryEnter()) return; // já há tradução em curso → descarta
      try {
        dispatch({ type: "SET_STATUS", status: "traduzindo…" });
        const fd = new FormData();
        fd.append("audio", wav, "fala.wav");
        fd.append("pair", JSON.stringify(pairRef.current));
        fd.append("history", JSON.stringify(turnsRef.current.slice(-HISTORY_WINDOW)));
        fd.append("glossary", formatGlossary(glossaryRef.current, pairRef.current!));
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
        if (r.glossary.length) {
          dispatch({ type: "SET_GLOSSARY", glossary: mergeGlossary(glossaryRef.current, r.glossary) });
        }
        dispatch({ type: "SET_STATUS", status: mutedRef.current ? "ouvindo" : "falando…" });
        // pauseMicRef/resumeMicRef são refs atualizadas após useMicVAD (abaixo).
        // Usar via ref evita stale closure e mantém deps do useCallback vazios.
        await playWithVadGuard({
          audioBase64: r.audioBase64,
          muted: mutedRef.current,
          play: playBase64Audio,
          pauseMic: () => pauseMicRef.current(),
          resumeMic: () => resumeMicRef.current(),
        });
        dispatch({ type: "SET_STATUS", status: "ouvindo" });
      } catch (e) {
        dispatch({ type: "SET_STATUS", status: e instanceof Error ? e.message : "erro" });
      } finally {
        gateRef.current.release();
      }
    }
  }, []);

  const { listening, start, stop, pauseMic, resumeMic } = useMicVAD(handleSpeech);
  // Espelhos em ref para uso dentro do handleSpeech (que é definido antes do
  // useMicVAD). O padrão é idêntico ao usado para phaseRef, pairRef etc.
  const pauseMicRef = useRef(pauseMic); pauseMicRef.current = pauseMic;
  const resumeMicRef = useRef(resumeMic); resumeMicRef.current = resumeMic;

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

  const pause = useCallback(() => {
    // libera a porta caso uma tradução estivesse em curso
    gateRef.current.release();
    stop();
    dispatch({ type: "SET_STATUS", status: "pausado" });
  }, [stop]);

  const resume = useCallback(async () => {
    try {
      await start();
      dispatch({ type: "SET_STATUS", status: "ouvindo" });
    } catch {
      dispatch({ type: "ERROR", error: "Falha ao retomar microfone." });
    }
  }, [start]);

  const reset = useCallback(() => {
    // libera a porta caso uma tradução estivesse em curso
    gateRef.current.release();
    clearSession();
    stop();
    dispatch({ type: "RESET" });
  }, [stop]);

  const toggleMute = useCallback(() => dispatch({ type: "TOGGLE_MUTE" }), []);

  return { state, listening, begin, pause, resume, reset, toggleMute };
}
