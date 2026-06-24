#pragma once
#include <Arduino.h>
#include <cstdint>
#include <cstddef>

/** Resultado de uma tradução vinda do backend. mp3 é alocado em PSRAM (free pelo caller). */
struct TranslateResult {
  uint8_t* mp3 = nullptr;
  size_t mp3Len = 0;
  String sourceText, sourceLang, targetText, targetLang;
};

/** Conecta ao Wi-Fi (bloqueante, com log). */
void wifiBegin();

/** True se o Wi-Fi está conectado. */
bool wifiConnected();

/**
 * Envia o WAV (já com header) ao backend /api/translate junto com o par de
 * idiomas (de config.h) e o history JSON. Em sucesso preenche out e retorna true.
 */
bool translate(const uint8_t* wav, size_t wavLen, const String& historyJson, TranslateResult& out);
