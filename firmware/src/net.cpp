#include "net.h"
#include "config.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <mbedtls/base64.h>

// Alocador ArduinoJson que usa PSRAM (a resposta com MP3 base64 é grande).
struct PsramAllocator : ArduinoJson::Allocator {
  void* allocate(size_t n) override { return ps_malloc(n); }
  void deallocate(void* p) override { free(p); }
  void* reallocate(void* p, size_t n) override { return ps_realloc(p, n); }
};

void wifiBegin() {
  Serial.printf("[wifi] conectando a %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.printf("\n[wifi] conectado, IP=%s\n", WiFi.localIP().toString().c_str());
}

bool wifiConnected() { return WiFi.status() == WL_CONNECTED; }

// Monta o JSON do par de idiomas a partir de config.h.
static String buildPairJson() {
  JsonDocument doc;
  doc["langA"]["code"] = LANG_A_CODE;
  doc["langA"]["name"] = LANG_A_NAME;
  doc["langB"]["code"] = LANG_B_CODE;
  doc["langB"]["name"] = LANG_B_NAME;
  String s;
  serializeJson(doc, s);
  return s;
}

bool translate(const uint8_t* wav, size_t wavLen, const String& historyJson, TranslateResult& out) {
  WiFiClientSecure tls;
  WiFiClient plain;
  Client* client;
  if (USE_TLS) {
    tls.setInsecure(); // MVP acadêmico: sem validar certificado
    client = &tls;
  } else {
    client = &plain;
  }

  if (!client->connect(SERVER_HOST, SERVER_PORT)) {
    Serial.println("[net] falha ao conectar no servidor");
    return false;
  }

  const String boundary = "----traduzai" + String(millis());
  const String pairJson = buildPairJson();

  const String partAudioHead =
      "--" + boundary + "\r\n"
      "Content-Disposition: form-data; name=\"audio\"; filename=\"fala.wav\"\r\n"
      "Content-Type: audio/wav\r\n\r\n";
  const String partPair =
      "\r\n--" + boundary + "\r\n"
      "Content-Disposition: form-data; name=\"pair\"\r\n\r\n" + pairJson;
  const String partHistory =
      "\r\n--" + boundary + "\r\n"
      "Content-Disposition: form-data; name=\"history\"\r\n\r\n" + historyJson;
  const String tail = "\r\n--" + boundary + "--\r\n";

  const size_t contentLength =
      partAudioHead.length() + wavLen + partPair.length() + partHistory.length() + tail.length();

  // Request line + headers
  client->printf("POST %s HTTP/1.1\r\n", SERVER_PATH);
  client->printf("Host: %s\r\n", SERVER_HOST);
  client->printf("Content-Type: multipart/form-data; boundary=%s\r\n", boundary.c_str());
  client->printf("Content-Length: %u\r\n", (unsigned)contentLength);
  client->print("Connection: close\r\n\r\n");

  // Body
  client->print(partAudioHead);
  client->write(wav, wavLen);
  client->print(partPair);
  client->print(partHistory);
  client->print(tail);

  // Pula os headers da resposta (até a linha em branco).
  String statusLine = client->readStringUntil('\n');
  Serial.printf("[net] resposta: %s\n", statusLine.c_str());
  while (client->connected()) {
    String line = client->readStringUntil('\n');
    if (line == "\r" || line.length() == 0) break;
  }

  // Lê o corpo inteiro para a PSRAM.
  const size_t CAP = 200 * 1024;
  char* body = (char*)ps_malloc(CAP);
  if (!body) { Serial.println("[net] sem PSRAM p/ corpo"); client->stop(); return false; }
  size_t bodyLen = 0;
  const unsigned long readDeadline = millis() + 15000; // evita travar se o server não fechar
  while (client->connected() || client->available()) {
    while (client->available() && bodyLen < CAP - 1) {
      body[bodyLen++] = (char)client->read();
    }
    if (bodyLen >= CAP - 1) { Serial.println("[net] resposta truncada (excedeu o buffer)"); break; }
    if (millis() > readDeadline) { Serial.println("[net] timeout lendo resposta"); break; }
    if (!client->available() && !client->connected()) break;
  }
  body[bodyLen] = '\0';
  client->stop();

  // Parseia o JSON (filtra só os campos necessários p/ economizar memória).
  PsramAllocator alloc;
  JsonDocument filter;
  filter["sourceText"] = true;
  filter["sourceLang"] = true;
  filter["targetText"] = true;
  filter["targetLang"] = true;
  filter["audioBase64"] = true;
  JsonDocument doc(&alloc);
  DeserializationError err = deserializeJson(doc, body, DeserializationOption::Filter(filter));
  if (err) {
    Serial.printf("[net] JSON inválido: %s\n", err.c_str());
    free(body);
    return false;
  }

  const char* b64 = doc["audioBase64"] | "";
  const size_t b64Len = strlen(b64);
  if (b64Len == 0) { Serial.println("[net] resposta sem audioBase64"); free(body); return false; }

  // base64-decode do MP3 para a PSRAM.
  size_t outLen = 0;
  // 1ª chamada: descobre o tamanho necessário.
  mbedtls_base64_decode(nullptr, 0, &outLen, (const unsigned char*)b64, b64Len);
  uint8_t* mp3 = (uint8_t*)ps_malloc(outLen);
  if (!mp3) { Serial.println("[net] sem PSRAM p/ MP3"); free(body); return false; }
  if (mbedtls_base64_decode(mp3, outLen, &outLen, (const unsigned char*)b64, b64Len) != 0) {
    Serial.println("[net] falha no base64");
    free(mp3); free(body);
    return false;
  }

  out.mp3 = mp3;
  out.mp3Len = outLen;
  out.sourceText = (const char*)(doc["sourceText"] | "");
  out.sourceLang = (const char*)(doc["sourceLang"] | "");
  out.targetText = (const char*)(doc["targetText"] | "");
  out.targetLang = (const char*)(doc["targetLang"] | "");
  free(body);
  Serial.printf("[net] ok: '%s' (%s) -> '%s' (%s), mp3=%u bytes\n",
                out.sourceText.c_str(), out.sourceLang.c_str(),
                out.targetText.c_str(), out.targetLang.c_str(), (unsigned)out.mp3Len);
  return true;
}
