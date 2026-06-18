import { chatText } from "@/lib/openai";
import { buildRecapMessages } from "@/lib/recap";
import type { LanguagePair, Turn } from "@/lib/types";

/** Gera o resumo bilíngue da conversa. */
export async function runRecap(input: { pair: LanguagePair; turns: Turn[] }): Promise<string> {
  return chatText(buildRecapMessages(input));
}
