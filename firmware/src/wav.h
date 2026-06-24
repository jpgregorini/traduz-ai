#pragma once
#include <cstdint>
#include <cstddef>

/**
 * Escreve o header WAV de 44 bytes (PCM 16-bit mono) em out.
 * Espelha web/lib/audio.ts:encodeWAV. Retorna 44.
 */
size_t writeWavHeader(uint8_t* out, uint32_t numSamples, uint32_t sampleRate);
