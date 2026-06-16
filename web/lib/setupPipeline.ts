import { transcribe, chatJSON } from "@/lib/openai";
import { buildSetupMessages } from "@/lib/prompt";
import { parseLanguageSetup } from "@/lib/languages";
import type { LanguagePair } from "@/lib/types";

/** Recebe a fala com os dois idiomas e devolve o par configurado. */
export async function runSetup(audio: File): Promise<LanguagePair> {
  const transcript = await transcribe(audio);
  const raw = await chatJSON(buildSetupMessages(transcript));
  return parseLanguageSetup(raw);
}
