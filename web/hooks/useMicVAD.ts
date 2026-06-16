"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Assets do VAD/ONNX servidos via CDN (evita copiar wasm/modelo para /public no MVP).
const VAD_ASSET_PATH = "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@latest/dist/";
const ORT_WASM_PATH = "https://cdn.jsdelivr.net/npm/onnxruntime-web@latest/dist/";

/**
 * Encapsula @ricky0123/vad-web. Chama onSpeechEnd com as amostras
 * (Float32Array mono 16 kHz) sempre que o usuário termina uma fala.
 */
export function useMicVAD(onSpeechEnd: (audio: Float32Array) => void) {
  const [listening, setListening] = useState(false);
  // Mantém referência mutável ao callback sem recriar o VAD.
  const cbRef = useRef(onSpeechEnd);
  cbRef.current = onSpeechEnd;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vadRef = useRef<any>(null);

  const start = useCallback(async () => {
    if (vadRef.current) {
      await vadRef.current.start();
      setListening(true);
      return;
    }
    // Import dinâmico: a lib só funciona no browser.
    const { MicVAD } = await import("@ricky0123/vad-web");
    vadRef.current = await MicVAD.new({
      baseAssetPath: VAD_ASSET_PATH,
      onnxWASMBasePath: ORT_WASM_PATH,
      onSpeechEnd: (audio: Float32Array) => cbRef.current(audio),
    });
    await vadRef.current.start();
    setListening(true);
  }, []);

  const stop = useCallback(() => {
    vadRef.current?.pause();
    setListening(false);
  }, []);

  useEffect(() => {
    return () => vadRef.current?.destroy?.();
  }, []);

  return { listening, start, stop };
}
