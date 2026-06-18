import { describe, it, expect } from "vitest";
import { mergeGlossary, formatGlossary } from "@/lib/glossary";
import type { LanguagePair, GlossaryEntry } from "@/lib/types";

const par: LanguagePair = {
  langA: { code: "pt", name: "Português" },
  langB: { code: "en", name: "English" },
};

describe("mergeGlossary", () => {
  it("adiciona termos novos", () => {
    const prev: GlossaryEntry[] = [{ term: "João", translations: { pt: "João", en: "John" } }];
    const next: GlossaryEntry[] = [{ term: "Maria", translations: { pt: "Maria", en: "Mary" } }];
    const out = mergeGlossary(prev, next);
    expect(out).toHaveLength(2);
  });

  it("funde traduções do mesmo termo (case-insensitive) sem duplicar", () => {
    const prev: GlossaryEntry[] = [{ term: "João", translations: { pt: "João" } }];
    const next: GlossaryEntry[] = [{ term: "joão", translations: { en: "John" } }];
    const out = mergeGlossary(prev, next);
    expect(out).toHaveLength(1);
    expect(out[0].translations).toEqual({ pt: "João", en: "John" });
  });

  it("ignora entradas sem term", () => {
    const out = mergeGlossary([], [{ term: "", translations: { pt: "x" } } as GlossaryEntry]);
    expect(out).toHaveLength(0);
  });

  it("next overrides conflicting translations", () => {
    const prev: GlossaryEntry[] = [{ term: "João", translations: { pt: "João_old", en: "John_old" } }];
    const next: GlossaryEntry[] = [{ term: "joão", translations: { pt: "João_new", en: "John_new" } }];
    const out = mergeGlossary(prev, next);
    expect(out).toHaveLength(1);
    expect(out[0].translations).toEqual({ pt: "João_new", en: "John_new" });
  });
});

describe("formatGlossary", () => {
  it("vazio devolve string vazia", () => {
    expect(formatGlossary([], par)).toBe("");
  });

  it("renderiza termos com as traduções do par", () => {
    const out = formatGlossary(
      [{ term: "João", translations: { pt: "João", en: "John" } }],
      par,
    );
    expect(out).toContain("João");
    expect(out).toContain("John");
  });
});
