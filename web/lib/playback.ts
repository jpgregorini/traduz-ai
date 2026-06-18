/**
 * Toca o áudio traduzido com guarda de eco: pausa o microfone (VAD)
 * durante o playback e o retoma depois, evitando que o app traduza a
 * própria fala sintetizada. O retomar acontece sempre (finally), mesmo
 * se o playback falhar, para não deixar o microfone morto.
 */
export async function playWithVadGuard(opts: {
  audioBase64: string;
  muted: boolean;
  play: (base64: string) => Promise<void>;
  pauseMic: () => void;
  resumeMic: () => void | Promise<void>;
}): Promise<void> {
  if (opts.muted) return;
  opts.pauseMic();
  try {
    await opts.play(opts.audioBase64);
  } catch (e) {
    // Erro de playback não interrompe o fluxo; o importante é retomar o mic.
    console.warn("[playback] erro ao tocar áudio:", e);
  } finally {
    await opts.resumeMic();
  }
}
