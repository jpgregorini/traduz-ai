import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { LanguagePair, Turn } from "@/lib/types";

/**
 * Monta as mensagens para um resumo bilíngue curto da conversa.
 * O modelo deve devolver texto corrido nos dois idiomas do par.
 */
export function buildRecapMessages(input: {
  pair: LanguagePair;
  turns: Turn[];
}): ChatCompletionMessageParam[] {
  const { pair, turns } = input;
  // Formata os turnos com rótulo de idioma: (pt) Bom dia
  const transcript = turns.map((t) => `(${t.lang}) ${t.text}`).join("\n");
  return [
    {
      role: "system",
      content:
        "Você resume conversas traduzidas. Faça um resumo curto (3-5 frases) dos pontos principais " +
        `e de qualquer combinação/decisão. Escreva o resumo em ${pair.langA.name} e depois em ${pair.langB.name}, ` +
        "separados por uma linha em branco.",
    },
    { role: "user", content: `Conversa:\n${transcript}` },
  ];
}
