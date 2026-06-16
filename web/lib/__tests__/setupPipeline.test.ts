import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/openai", () => ({
  transcribe: vi.fn(),
  chatJSON: vi.fn(),
}));

import { transcribe, chatJSON } from "@/lib/openai";
import { runSetup } from "@/lib/setupPipeline";

beforeEach(() => {
  vi.mocked(transcribe).mockReset();
  vi.mocked(chatJSON).mockReset();
});

describe("runSetup", () => {
  it("transcreve e devolve o par de idiomas", async () => {
    vi.mocked(transcribe).mockResolvedValue("português e inglês");
    vi.mocked(chatJSON).mockResolvedValue(
      '{"langA":{"code":"pt","name":"Português"},"langB":{"code":"en","name":"English"}}',
    );
    const file = new File([new Uint8Array([1])], "f.wav", { type: "audio/wav" });
    const pair = await runSetup(file);
    expect(pair.langA.code).toBe("pt");
    expect(pair.langB.code).toBe("en");
    expect(transcribe).toHaveBeenCalledWith(file);
  });

  it("propaga erro quando o modelo não acha dois idiomas", async () => {
    vi.mocked(transcribe).mockResolvedValue("blá blá");
    vi.mocked(chatJSON).mockResolvedValue('{"error":"not_two_languages"}');
    const file = new File([new Uint8Array([1])], "f.wav", { type: "audio/wav" });
    await expect(runSetup(file)).rejects.toThrow();
  });
});
