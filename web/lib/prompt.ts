import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { LanguagePair, Turn } from "@/lib/types";

/**
 * Monta as mensagens para extrair os dois idiomas que o usuário falou.
 * O modelo deve devolver JSON com códigos ISO 639-1 e nomes.
 */
export function buildSetupMessages(transcript: string): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content:
        "Você configura uma sessão de tradução. O usuário falou os dois idiomas que vai usar. " +
        "Extraia exatamente dois idiomas distintos. Responda SOMENTE em JSON no formato " +
        '{"langA":{"code":"<ISO 639-1>","name":"<nome>"},"langB":{"code":"<ISO 639-1>","name":"<nome>"}}. ' +
        "Se não identificar dois idiomas, responda {\"error\":\"not_two_languages\"}.",
    },
    { role: "user", content: transcript },
  ];
}

/**
 * Monta as mensagens de tradução. O modelo detecta em qual dos dois
 * idiomas configurados está a fala e traduz para o outro, usando o
 * histórico como contexto. Devolve JSON {sourceLang, targetText}.
 */
export function buildTranslationMessages(input: {
  text: string;
  pair: LanguagePair;
  history: Turn[];
}): ChatCompletionMessageParam[] {
  const { text, pair, history } = input;
  const contexto = history
    .map((t) => `(${t.lang}) ${t.text}`)
    .join("\n");

  return [
    {
      role: "system",
      content:
        "Você é um intérprete simultâneo. Os dois idiomas da conversa são " +
        `${pair.langA.name} (${pair.langA.code}) e ${pair.langB.name} (${pair.langB.code}). ` +
        "A fala do usuário está em UM desses dois idiomas. Detecte qual e traduza para o OUTRO, " +
        "preservando tom, nomes próprios, termos do domínio e nível de formalidade. " +
        "Use o histórico apenas como contexto. " +
        'Responda SOMENTE em JSON {"sourceLang":"<código ISO do idioma da fala>","targetText":"<tradução>"}.',
    },
    {
      role: "user",
      content:
        (contexto ? `Histórico da conversa:\n${contexto}\n\n` : "") +
        `Fala a traduzir:\n${text}`,
    },
  ];
}
