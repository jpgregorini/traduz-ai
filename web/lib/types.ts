/** Um idioma identificado por código ISO 639-1 e nome de exibição. */
export type Lang = { code: string; name: string };

/** Par de idiomas da sessão de conversa. */
export type LanguagePair = { langA: Lang; langB: Lang };

/** Um turno da conversa (fala original ou tradução). */
export type Turn = {
  role: "original" | "translation";
  lang: string; // código ISO
  text: string;
};

/** Resultado de uma tradução completa (texto + voz). */
export type TranslateResult = {
  sourceText: string;
  sourceLang: string;
  targetText: string;
  targetLang: string;
  audioBase64: string; // MP3 em base64
};
