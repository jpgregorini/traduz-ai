import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/openai", () => ({
  transcribe: vi.fn(),
  chatJSON: vi.fn(),
  synthesize: vi.fn(),
}));

import { transcribe, chatJSON, synthesize } from "@/lib/openai";
import { runTranslate } from "@/lib/translatePipeline";
import type { LanguagePair } from "@/lib/types";

const par: LanguagePair = {
  langA: { code: "pt", name: "Português" },
  langB: { code: "en", name: "English" },
};

beforeEach(() => {
  vi.mocked(transcribe).mockReset();
  vi.mocked(chatJSON).mockReset();
  vi.mocked(synthesize).mockReset();
});

describe("runTranslate", () => {
  it("transcreve, traduz com roteamento e sintetiza", async () => {
    vi.mocked(transcribe).mockResolvedValue("Bom dia");
    vi.mocked(chatJSON).mockResolvedValue('{"sourceLang":"pt","targetText":"Good morning"}');
    vi.mocked(synthesize).mockResolvedValue("QUJD"); // base64 fake

    const file = new File([new Uint8Array([1])], "f.wav", { type: "audio/wav" });
    const r = await runTranslate({ audio: file, pair: par, history: [] });

    expect(r.sourceText).toBe("Bom dia");
    expect(r.sourceLang).toBe("pt");
    expect(r.targetLang).toBe("en"); // pt → en
    expect(r.targetText).toBe("Good morning");
    expect(r.audioBase64).toBe("QUJD");
    expect(synthesize).toHaveBeenCalledWith("Good morning");
  });
});
