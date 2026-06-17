#include <Arduino.h>
#include "config.h"

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("[traduzai] firmware iniciado");
}

void loop() {
  delay(1000);
}
