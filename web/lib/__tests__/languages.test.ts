import { describe, it, expect } from "vitest";
import { parseLanguageSetup, parseTranslation } from "@/lib/languages";
import type { LanguagePair } from "@/lib/types";

const par: LanguagePair = {
  langA: { code: "pt", name: "Português" },
  langB: { code: "en", name: "English" },
};

describe("parseLanguageSetup", () => {
  it("aceita JSON com dois idiomas", () => {
    const raw = '{"langA":{"code":"pt","name":"Português"},"langB":{"code":"en","name":"English"}}';
    expect(parseLanguageSetup(raw)).toEqual(par);
  });
  it("lança quando o modelo sinaliza erro", () => {
    expect(() => parseLanguageSetup('{"error":"not_two_languages"}')).toThrow();
  });
  it("lança em JSON inválido", () => {
    expect(() => parseLanguageSetup("não é json")).toThrow();
  });
});

describe("parseTranslation", () => {
  it("aceita sourceLang válido e targetText", () => {
    const r = parseTranslation('{"sourceLang":"pt","targetText":"Good morning"}', par);
    expect(r).toEqual({ sourceLang: "pt", targetText: "Good morning" });
  });
  it("força sourceLang ao idioma A quando vem fora do par", () => {
    const r = parseTranslation('{"sourceLang":"fr","targetText":"x"}', par);
    expect(r.sourceLang).toBe("pt");
  });
  it("lança quando targetText está vazio", () => {
    expect(() => parseTranslation('{"sourceLang":"pt","targetText":""}', par)).toThrow();
  });
});
