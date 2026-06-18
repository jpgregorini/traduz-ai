/**
 * Player de áudio baseado na Web Audio API.
 *
 * Por que não usar `new Audio().play()`? No mobile (iOS Safari, Chrome
 * Android) a reprodução de áudio precisa nascer de um gesto do usuário.
 * A fala traduzida toca dentro do callback do VAD — longe de qualquer
 * toque — então o navegador bloqueia. A solução é destravar um
 * `AudioContext` no gesto (toque no botão) via `unlock()` e reproduzir os
 * MP3 seguintes por esse mesmo contexto, que permanece liberado.
 */

// Subconjunto mínimo do AudioContext que usamos — facilita a injeção de um
// contexto falso nos testes (jsdom não implementa Web Audio).
export interface AudioContextLike {
  readonly state: AudioContextState;
  resume(): Promise<void>;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
  createBufferSource(): AudioBufferSourceNode;
  readonly destination: AudioDestinationNode;
}

export interface AudioPlayer {
  /** Destrava o áudio. Chamar dentro de um gesto do usuário (ex: toque no botão). */
  unlock(): Promise<void>;
  /** Toca um MP3 em base64. Resolve quando o áudio termina. */
  play(base64Mp3: string): Promise<void>;
}

/** Converte um MP3 em base64 para ArrayBuffer (entrada do decodeAudioData). */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Fábrica padrão: cria um AudioContext do navegador (com fallback webkit). */
function defaultFactory(): AudioContextLike {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctor();
}

/**
 * Cria um player com contexto preguiçoso e reutilizado. `createContext`
 * é injetável para testes; em produção usa o AudioContext do navegador.
 */
export function createAudioPlayer(
  createContext: () => AudioContextLike = defaultFactory,
): AudioPlayer {
  let ctx: AudioContextLike | null = null;

  function ensureContext(): AudioContextLike {
    if (!ctx) ctx = createContext();
    return ctx;
  }

  // Retoma o contexto se não estiver tocando (suspended/closed após inatividade).
  async function ensureRunning(c: AudioContextLike): Promise<void> {
    if (c.state !== "running") await c.resume();
  }

  async function unlock(): Promise<void> {
    await ensureRunning(ensureContext());
  }

  async function play(base64Mp3: string): Promise<void> {
    const c = ensureContext();
    await ensureRunning(c);
    const buffer = await c.decodeAudioData(base64ToArrayBuffer(base64Mp3));
    await new Promise<void>((resolve) => {
      const source = c.createBufferSource();
      source.buffer = buffer;
      source.connect(c.destination);
      source.onended = () => resolve();
      source.start();
    });
  }

  return { unlock, play };
}

// Singleton: há um único AudioContext por app, e o player é leve e sem estado
// observável. Usar singleton evita guardá-lo num ref do componente.
let shared: AudioPlayer | null = null;

/** Devolve o player de áudio compartilhado do app (criado sob demanda). */
export function sharedAudioPlayer(): AudioPlayer {
  if (!shared) shared = createAudioPlayer();
  return shared;
}
