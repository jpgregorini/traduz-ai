import type { LanguagePair } from "@/lib/types";

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

/** Valida a resposta JSON da tradução; clampa sourceLang ao par. */
export function parseTranslation(
  raw: string,
  pair: LanguagePair,
): { sourceLang: string; targetText: string } {
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
  return { sourceLang, targetText };
}
