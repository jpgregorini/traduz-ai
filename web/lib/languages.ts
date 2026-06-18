import type { GlossaryEntry, LanguagePair } from "@/lib/types";

/** Converte a resposta JSON do setup em um par de idiomas validado. */
export function parseLanguageSetup(raw: string): LanguagePair {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error("Resposta de setup não é JSON válido.");
  }
  const o = obj as Record<string, any>;
  if (o?.error || !o?.langA?.code || !o?.langB?.code) {
    throw new Error("Não identifiquei dois idiomas. Peça para repetir.");
  }
  if (o.langA.code === o.langB.code) {
    throw new Error("Os dois idiomas precisam ser diferentes.");
  }
  return {
    langA: { code: String(o.langA.code), name: String(o.langA.name ?? o.langA.code) },
    langB: { code: String(o.langB.code), name: String(o.langB.name ?? o.langB.code) },
  };
}

/** Valida a resposta JSON da tradução; clampa sourceLang ao par; extrai glossário com degradação graciosa. */
export function parseTranslation(
  raw: string,
  pair: LanguagePair,
): { sourceLang: string; targetText: string; glossary: GlossaryEntry[] } {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error("Resposta de tradução não é JSON válido.");
  }
  const o = obj as Record<string, any>;
  const targetText = String(o?.targetText ?? "").trim();
  if (!targetText) {
    throw new Error("Tradução vazia.");
  }
  let sourceLang = String(o?.sourceLang ?? "");
  if (sourceLang !== pair.langA.code && sourceLang !== pair.langB.code) {
    // Fora do par: assume idioma A (alvo cairá em B).
    sourceLang = pair.langA.code;
  }
  // Extrai glossário com degradação graciosa: ausente, malformado ou inválido vira lista vazia.
  const glossary: GlossaryEntry[] = Array.isArray(o?.glossary)
    ? o.glossary
        .filter((g: any) => g && typeof g.term === "string" && g.translations && typeof g.translations === "object")
        .map((g: any) => ({ term: String(g.term), translations: g.translations as Record<string, string> }))
    : [];
  return { sourceLang, targetText, glossary };
}
