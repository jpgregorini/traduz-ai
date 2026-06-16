import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn();
vi.mock("openai", () => {
  return {
    default: class {
      audio = { transcriptions: { create } };
    },
  };
});

beforeEach(() => create.mockReset());

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
