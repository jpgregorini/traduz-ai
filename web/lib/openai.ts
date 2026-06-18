import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

// Cliente criado sob demanda (lazy): não exige a chave no momento do build.
let _client: OpenAI | null = null;
function getClient(): OpenAI {
  // Lê OPENAI_API_KEY do ambiente (server-side). Nunca expor no cliente.
  if (!_client) _client = new OpenAI();
  return _client;
}

/** Transcreve um arquivo de áudio para texto. */
export async function transcribe(file: File): Promise<string> {
  const r = await getClient().audio.transcriptions.create({
    file,
    model: "gpt-4o-transcribe",
  });
  return r.text;
}

/** Chat completion que devolve JSON (string crua). */
export async function chatJSON(
  messages: ChatCompletionMessageParam[],
  model = "gpt-4o-mini",
): Promise<string> {
  const c = await getClient().chat.completions.create({
    model,
    messages,
    response_format: { type: "json_object" },
    temperature: 0.2,
  });
  return c.choices[0]?.message?.content ?? "";
}

/** Chat completion que devolve texto livre. */
export async function chatText(
  messages: ChatCompletionMessageParam[],
  model = "gpt-4o-mini",
): Promise<string> {
  const c = await getClient().chat.completions.create({ model, messages, temperature: 0.3 });
  return c.choices[0]?.message?.content ?? "";
}

/** Sintetiza voz a partir de texto na voz indicada; devolve MP3 em base64. */
export async function synthesize(text: string, voice = "alloy"): Promise<string> {
  const speech = await getClient().audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice,
    input: text,
  });
  const buf = Buffer.from(await speech.arrayBuffer());
  return buf.toString("base64");
}
