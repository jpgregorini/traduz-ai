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
  const history: Turn[] = [{ role: "original", lang: "pt", text: "Bom dia" }];

  it("inclui idiomas, histórico rotulado e a fala atual", () => {
    const msgs = buildTranslationMessages({ text: "Tudo bem?", pair: par, history });
    const blob = JSON.stringify(msgs);
    expect(blob).toContain("Português");
    expect(blob).toContain("English");
    expect(blob).toContain("(pt)");        // rótulo de idioma no histórico
    expect(blob).toContain("Bom dia");
    expect(blob).toContain("Tudo bem?");
    expect(blob.toLowerCase()).toContain("json");
    expect(blob).toContain("glossary");    // instrui extração de glossário
  });

  it("injeta o glossário recebido", () => {
    const msgs = buildTranslationMessages({
      text: "oi", pair: par, history: [],
      glossary: "- João: pt=João, en=John",
    });
    expect(JSON.stringify(msgs)).toContain("John");
  });
});
