#include "audio_capture.h"
#include "config.h"
#include <Arduino.h>
#include <driver/i2s.h>
#include <math.h>

static const i2s_port_t MIC_PORT = I2S_NUM_0;

void micBegin() {
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
  cfg.sample_rate = SAMPLE_RATE;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT; // INMP441 entrega 24-bit em slot de 32
  cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;  // L/R ligado em GND
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  cfg.dma_buf_count = 8;
  cfg.dma_buf_len = FRAME_SAMPLES;
  cfg.use_apll = false;

  i2s_pin_config_t pins = {};
  pins.bck_io_num = I2S_MIC_SCK;
  pins.ws_io_num = I2S_MIC_WS;
  pins.data_out_num = I2S_PIN_NO_CHANGE;
  pins.data_in_num = I2S_MIC_SD;

  i2s_driver_install(MIC_PORT, &cfg, 0, nullptr);
  i2s_set_pin(MIC_PORT, &pins);
  Serial.println("[mic] I2S0 inicializado");
}

size_t micReadFrame(int16_t* dst) {
  static int32_t raw[FRAME_SAMPLES];
  size_t bytesRead = 0;
  i2s_read(MIC_PORT, raw, sizeof(raw), &bytesRead, portMAX_DELAY);
  const size_t n = bytesRead / sizeof(int32_t);
  for (size_t i = 0; i < n; i++) {
    // INMP441: dado útil nos bits altos; >>14 leva ~24-bit a ~16-bit.
    dst[i] = (int16_t)(raw[i] >> 14);
  }
  return n;
}

float frameRms(const int16_t* buf, size_t n) {
  if (n == 0) return 0.0f;
  double acc = 0.0;
  for (size_t i = 0; i < n; i++) acc += (double)buf[i] * (double)buf[i];
  return (float)sqrt(acc / (double)n);
}
