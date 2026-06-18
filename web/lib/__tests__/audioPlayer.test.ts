import { describe, it, expect, vi } from "vitest";
import { createAudioPlayer, sharedAudioPlayer } from "@/lib/audioPlayer";

// Fábrica de um AudioContext falso que registra as fontes criadas e
// "termina" a reprodução imediatamente (dispara onended ao dar start).
function fakeContext() {
  const sources: Array<{
    buffer: AudioBuffer | null;
    connect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  }> = [];

  const ctx = {
    state: "suspended" as AudioContextState,
    resume: vi.fn(async () => {
      ctx.state = "running";
    }),
    decodeAudioData: vi.fn(async (_buf: ArrayBuffer) => ({ duration: 1 } as AudioBuffer)),
    createBuffer: vi.fn(
      (_ch: number, _len: number, _rate: number) => ({ duration: 0 } as AudioBuffer),
    ),
    createBufferSource: vi.fn(() => {
      const src = {
        buffer: null as AudioBuffer | null,
        connect: vi.fn(),
        start: vi.fn(() => src.onended?.()),
        onended: null as (() => void) | null,
      };
      sources.push(src);
      return src as unknown as AudioBufferSourceNode;
    }),
    destination: { id: "dest" } as unknown as AudioDestinationNode,
  };
  return { ctx, sources };
}

describe("createAudioPlayer", () => {
  it("unlock cria o contexto e o retoma (resume)", async () => {
    const { ctx } = fakeContext();
    const player = createAudioPlayer(() => ctx);
    await player.unlock();
    expect(ctx.resume).toHaveBeenCalled();
    expect(ctx.state).toBe("running");
  });

  it("unlock toca um buffer silencioso dentro do gesto (destrava o iOS)", async () => {
    const { ctx, sources } = fakeContext();
    const player = createAudioPlayer(() => ctx);
    await player.unlock();
    // No iOS, resume() sozinho não basta: é preciso disparar uma fonte de
    // áudio (buffer silencioso) dentro do gesto para liberar a saída.
    expect(ctx.createBuffer).toHaveBeenCalled();
    expect(sources).toHaveLength(1);
    expect(sources[0].connect).toHaveBeenCalledWith(ctx.destination);
    expect(sources[0].start).toHaveBeenCalled();
  });

  it("play decodifica o base64 e toca pela fonte, resolvendo quando termina", async () => {
    const { ctx, sources } = fakeContext();
    const player = createAudioPlayer(() => ctx);
    await player.play("QUJD"); // "ABC" em base64
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(sources).toHaveLength(1);
    expect(sources[0].connect).toHaveBeenCalledWith(ctx.destination);
    expect(sources[0].start).toHaveBeenCalled();
  });

  it("reusa o mesmo contexto entre chamadas", async () => {
    let created = 0;
    const { ctx } = fakeContext();
    const player = createAudioPlayer(() => {
      created++;
      return ctx;
    });
    await player.unlock();
    await player.play("QUJD");
    await player.play("QUJD");
    expect(created).toBe(1);
  });

  it("play retoma o contexto se ele estiver suspenso (sem unlock prévio)", async () => {
    const { ctx } = fakeContext();
    const player = createAudioPlayer(() => ctx);
    await player.play("QUJD");
    expect(ctx.resume).toHaveBeenCalled();
  });
});

describe("sharedAudioPlayer", () => {
  it("devolve sempre a mesma instância", () => {
    expect(sharedAudioPlayer()).toBe(sharedAudioPlayer());
  });
});
