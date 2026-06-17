#include <Arduino.h>
#include "config.h"
#include "audio_playback.h"
#include "test_tone_mp3.h"  // gerado acima

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("[traduzai] bring-up do alto-falante");
  speakerBegin();
  playMp3(TEST_TONE_MP3, TEST_TONE_MP3_LEN);
}

void loop() { delay(1000); }
