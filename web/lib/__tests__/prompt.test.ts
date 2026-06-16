import { describe, it, expect } from "vitest";
import { buildSetupMessages, buildTranslationMessages } from "@/lib/prompt";
import type { LanguagePair, Turn } from "@/lib/types";

const par: LanguagePair = {
  langA: { code: "pt", name: "Português" },
  langB: { code: "en", name: "English" },
};

describe("buildSetupMessages", () => {
  it("inclui a transcrição e pede JSON", () => {
    const msgs = buildSetupMessages("português e inglês");
    const blob = JSON.stringify(msgs);
    expect(blob).toContain("português e inglês");
    expect(blob.toLowerCase()).toContain("json");
  });
});

describe("buildTranslationMessages", () => {
  it("inclui os dois idiomas, o histórico e a fala atual", () => {
    const history: Turn[] = [{ role: "original", lang: "pt", text: "Bom dia" }];
    const msgs = buildTranslationMessages({ text: "Tudo bem?", pair: par, history });
    const blob = JSON.stringify(msgs);
    expect(blob).toContain("Português");
    expect(blob).toContain("English");
    expect(blob).toContain("Bom dia");      // contexto
    expect(blob).toContain("Tudo bem?");    // fala atual
    expect(blob.toLowerCase()).toContain("json");
  });
});
