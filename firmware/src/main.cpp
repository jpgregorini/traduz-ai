#include <Arduino.h>
#include "config.h"
#include "net.h"
#include "wav.h"
#include "audio_playback.h"

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("[traduzai] bring-up de rede");
  wifiBegin();
  speakerBegin();

  // WAV de 0,5 s de silêncio só p/ exercitar o POST.
  const uint32_t n = SAMPLE_RATE / 2;
  uint8_t* wav = (uint8_t*)ps_malloc(44 + n * 2);
  size_t hdr = writeWavHeader(wav, n, SAMPLE_RATE);
  memset(wav + hdr, 0, n * 2);

  TranslateResult r;
  if (translate(wav, hdr + n * 2, "[]", r)) {
    Serial.println("[traduzai] POST ok");
    if (r.mp3Len) { playMp3(r.mp3, r.mp3Len); free(r.mp3); }
  } else {
    Serial.println("[traduzai] POST falhou");
  }
  free(wav);
}

void loop() { delay(1000); }
