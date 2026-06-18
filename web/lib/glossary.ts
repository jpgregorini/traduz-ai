import type { GlossaryEntry, LanguagePair } from "@/lib/types";

/**
 * Funde o glossário anterior com termos novos. Mesma chave (term, sem
 * diferenciar maiúsculas) tem as traduções combinadas; o novo sobrescreve
 * traduções conflitantes. Entradas sem `term` são ignoradas.
 */
export function mergeGlossary(
  prev: GlossaryEntry[],
  next: GlossaryEntry[],
): GlossaryEntry[] {
  const byKey = new Map<string, GlossaryEntry>();
  for (const e of [...prev, ...next]) {
    const term = (e?.term ?? "").trim();
    if (!term) continue;
    const key = term.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.translations = { ...existing.translations, ...e.translations };
    } else {
      byKey.set(key, { term, translations: { ...e.translations } });
    }
  }
  return [...byKey.values()];
}

/**
 * Renderiza o glossário para injeção no prompt, mostrando as traduções
 * nos dois idiomas do par. Devolve "" se não houver termos.
 */
export function formatGlossary(entries: GlossaryEntry[], pair: LanguagePair): string {
  if (entries.length === 0) return "";
  const a = pair.langA.code;
  const b = pair.langB.code;
  return entries
    .map((e) => `- ${e.term}: ${a}=${e.translations[a] ?? "?"}, ${b}=${e.translations[b] ?? "?"}`)
    .join("\n");
}
