import type { GlossaryEntry, LanguagePair, Turn } from "@/lib/types";

const KEY = "traduzai.session";
const VERSION = 1;

/** Sessão salva com par de idiomas, histórico de turnos e glossário. */
export type SavedSession = {
  pair: LanguagePair;
  turns: Turn[];
  glossary: GlossaryEntry[];
};

/**
 * Persiste a sessão atual no localStorage (chave versionada).
 * Se localStorage não estiver disponível (SSR/modo privado), ignora silenciosamente.
 */
export function saveSession(s: SavedSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...s }));
  } catch {
    // Sem localStorage (SSR/privado): ignora silenciosamente.
  }
}

/**
 * Recarrega a sessão salva, ou null se ausente/incompatível.
 * Valida versão e estrutura mínima (pair.langA.code).
 */
export function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;

    const o = JSON.parse(raw);

    // Valida versão e estrutura mínima
    if (o?.v !== VERSION || !o?.pair?.langA?.code) return null;

    return {
      pair: o.pair,
      turns: o.turns ?? [],
      glossary: o.glossary ?? [],
    };
  } catch {
    // JSON inválido ou localStorage indisponível
    return null;
  }
}

/**
 * Apaga a sessão salva do localStorage.
 * Se localStorage não estiver disponível, ignora silenciosamente.
 */
export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignora
  }
}
