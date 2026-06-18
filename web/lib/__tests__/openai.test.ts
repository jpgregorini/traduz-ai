import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn();
const speechCreate = vi.fn();
vi.mock("openai", () => {
  return {
    default: class {
      audio = {
        transcriptions: { create },
        speech: { create: speechCreate },
      };
    },
  };
});

beforeEach(() => {
  create.mockReset();
  speechCreate.mockReset();
});

describe("transcribe", () => {
  it("chama o modelo de STT e devolve o texto", async () => {
    create.mockResolvedValue({ text: "olá mundo" });
    const { transcribe } = await import("@/lib/openai");
    const file = new File([new Uint8Array([1, 2, 3])], "fala.wav", { type: "audio/wav" });
    const texto = await transcribe(file);
    expect(texto).toBe("olá mundo");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4o-transcribe", file }),
    );
  });
});

describe("synthesize", () => {
  it("passa a voz recebida ao TTS e devolve base64", async () => {
    speechCreate.mockResolvedValue({
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    const { synthesize } = await import("@/lib/openai");
    const b64 = await synthesize("hello", "verse");
    expect(typeof b64).toBe("string");
    expect(speechCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4o-mini-tts", voice: "verse", input: "hello" }),
    );
  });
});
