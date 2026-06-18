import type { LanguagePair } from "@/lib/types";

// Presets distintos da OpenAI para cada lado da conversa (não é clonagem;
// dá o efeito de "duas pessoas" sem novas dependências).
const VOICE_A = "alloy";
const VOICE_B = "verse";

/**
 * Escolhe a voz do TTS conforme o idioma alvo: idioma A → VOICE_A,
 * idioma B → VOICE_B. Fora do par cai em VOICE_B (alvo padrão).
 */
export function voiceFor(lang: string, pair: LanguagePair): string {
  if (lang === pair.langA.code) return VOICE_A;
  return VOICE_B;
}
