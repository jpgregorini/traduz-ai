#include <Arduino.h>
#include "config.h"
#include "audio_capture.h"

static int16_t frame[FRAME_SAMPLES];

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("[traduzai] bring-up do microfone");
  micBegin();
}

void loop() {
  size_t n = micReadFrame(frame);
  float rms = frameRms(frame, n);
  Serial.printf("[mic] rms=%.1f\n", rms);
}
