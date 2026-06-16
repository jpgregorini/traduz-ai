import type { Lang, LanguagePair } from "@/lib/types";

/**
 * Decide o idioma alvo a partir do idioma detectado na fala.
 * Se o detectado for o idioma A, traduz para B, e vice-versa.
 * Idioma fora do par cai no padrão (B) — degradação graciosa.
 */
export function resolveTarget(detected: string, pair: LanguagePair): Lang {
  if (detected === pair.langA.code) return pair.langB;
  if (detected === pair.langB.code) return pair.langA;
  return pair.langB;
}
