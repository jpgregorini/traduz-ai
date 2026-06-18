import { transcribe, chatJSON, synthesize } from "@/lib/openai";
import { buildTranslationMessages } from "@/lib/prompt";
import { parseTranslation } from "@/lib/languages";
import { resolveTarget } from "@/lib/routing";
import { voiceFor } from "@/lib/voice";
import type { LanguagePair, Turn, TranslateResult } from "@/lib/types";

/** Pipeline completo de uma fala: STT → tradução com contexto/glossário → TTS. */
export async function runTranslate(input: {
  audio: File;
  pair: LanguagePair;
  history: Turn[];
  glossaryText?: string;
}): Promise<TranslateResult> {
  const { audio, pair, history, glossaryText } = input;

  const sourceText = await transcribe(audio);
  const raw = await chatJSON(
    buildTranslationMessages({ text: sourceText, pair, history, glossary: glossaryText }),
  );
  const { sourceLang, targetText, glossary } = parseTranslation(raw, pair);
  const targetLang = resolveTarget(sourceLang, pair).code;
  const audioBase64 = await synthesize(targetText, voiceFor(targetLang, pair));

  return { sourceText, sourceLang, targetText, targetLang, audioBase64, glossary };
}
