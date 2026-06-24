#pragma once
#include <cstdint>
#include <cstddef>

/** Inicializa o I2S0 para o microfone INMP441 (mono, 16 kHz, 16-bit). */
void micBegin();

/**
 * Lê um frame de FRAME_SAMPLES amostras int16 em dst.
 * Bloqueia até o I2S entregar o frame. Retorna o nº de amostras lidas.
 */
size_t micReadFrame(int16_t* dst);

/** RMS (raiz do valor quadrático médio) de um frame int16. */
float frameRms(const int16_t* buf, size_t n);
