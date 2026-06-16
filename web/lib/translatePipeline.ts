import { transcribe, chatJSON, synthesize } from "@/lib/openai";
import { buildTranslationMessages } from "@/lib/prompt";
import { parseTranslation } from "@/lib/languages";
import { resolveTarget } from "@/lib/routing";
import type { LanguagePair, Turn, TranslateResult } from "@/lib/types";

/** Pipeline completo de uma fala: STT → tradução com contexto → TTS. */
export async function runTranslate(input: {
  audio: File;
  pair: LanguagePair;
  history: Turn[];
}): Promise<TranslateResult> {
  const { audio, pair, history } = input;

  const sourceText = await transcribe(audio);
  const raw = await chatJSON(buildTranslationMessages({ text: sourceText, pair, history }));
  const { sourceLang, targetText } = parseTranslation(raw, pair);
  const targetLang = resolveTarget(sourceLang, pair).code;
  const audioBase64 = await synthesize(targetText);

  return { sourceText, sourceLang, targetText, targetLang, audioBase64 };
}
