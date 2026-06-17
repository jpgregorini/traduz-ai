#include "audio_playback.h"
#include "config.h"
#include <Arduino.h>
#include <AudioGeneratorMP3.h>
#include <AudioFileSourcePROGMEM.h>
#include <AudioOutputI2S.h>

// Saída no port I2S 1 (port 0 é do microfone).
static AudioOutputI2S* out = nullptr;

void speakerBegin() {
  out = new AudioOutputI2S(1 /* port */, AudioOutputI2S::EXTERNAL_I2S);
  out->SetPinout(I2S_SPK_BCLK, I2S_SPK_LRC, I2S_SPK_DIN);
  out->SetGain(0.8f);
  Serial.println("[spk] I2S1 inicializado");
}

void playMp3(const uint8_t* mp3, size_t len) {
  // AudioFileSourcePROGMEM lê de um ponteiro de memória (serve p/ PSRAM).
  AudioFileSourcePROGMEM src(mp3, len);
  AudioGeneratorMP3 mp3gen;
  Serial.printf("[spk] tocando MP3 (%u bytes)\n", (unsigned)len);
  if (!mp3gen.begin(&src, out)) {
    Serial.println("[spk] falha ao iniciar decoder MP3");
    return;
  }
  while (mp3gen.isRunning()) {
    if (!mp3gen.loop()) mp3gen.stop();
  }
  out->stop();
  Serial.println("[spk] fim do playback");
}
