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
  it("transcreve, traduz com roteamento, sintetiza com voz e devolve glossário", async () => {
    vi.mocked(transcribe).mockResolvedValue("Olá João");
    vi.mocked(chatJSON).mockResolvedValue(
      '{"sourceLang":"pt","targetText":"Hello John","glossary":[{"term":"João","translations":{"pt":"João","en":"John"}}]}',
    );
    vi.mocked(synthesize).mockResolvedValue("QUJD");

    const file = new File([new Uint8Array([1])], "f.wav", { type: "audio/wav" });
    const r = await runTranslate({ audio: file, pair: par, history: [], glossaryText: "" });

    expect(r.sourceText).toBe("Olá João");
    expect(r.sourceLang).toBe("pt");
    expect(r.targetLang).toBe("en");
    expect(r.targetText).toBe("Hello John");
    expect(r.audioBase64).toBe("QUJD");
    expect(r.glossary).toHaveLength(1);
    // alvo en = langB → voz distinta de "alloy"
    expect(synthesize).toHaveBeenCalledWith("Hello John", expect.any(String));
    expect(vi.mocked(synthesize).mock.calls[0][1]).not.toBe("");
  });
});
