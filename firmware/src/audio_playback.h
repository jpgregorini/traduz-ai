#pragma once
#include <cstdint>
#include <cstddef>

/** Inicializa a saída I2S1 para o amplificador MAX98357A. */
void speakerBegin();

/** Decoda e toca um buffer MP3 (na PSRAM). Bloqueia até terminar. */
void playMp3(const uint8_t* mp3, size_t len);
