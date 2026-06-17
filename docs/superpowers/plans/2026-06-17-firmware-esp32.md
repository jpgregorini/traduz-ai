# Firmware ESP32-S3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a pasta `firmware/` com um cliente embarcado ESP32-S3 que captura a fala (VAD por energia), envia ao backend Next.js existente (`POST /api/translate`) e reproduz a tradução decodando MP3 — reusando 100% do `web/`.

**Architecture:** PlatformIO. Módulos focados: `wav` (header WAV puro, testável no host), `audio_capture` (I2S0 + INMP441 + RMS), `audio_playback` (I2S1 + MAX98357A + decode MP3), `net` (WiFi + POST multipart + base64 + JSON). `main.cpp` orquestra uma máquina de estados IDLE→CAPTURING→SENDING→PLAYING e mantém um ring buffer de history.

**Tech Stack:** C++/Arduino, ESP32-S3, ESP-IDF I2S legacy (`driver/i2s.h`), ESP8266Audio (decode MP3), ArduinoJson, mbedtls (base64), WiFiClientSecure.

**Verificação:** módulos de hardware não rodam em CI. O passo de verificação padrão é `pio run` (compila sem erro) + um item de bring-up por serial documentado no README. O módulo `wav` tem teste unitário nativo real (Unity).

---

### Task 0: Scaffold do projeto PlatformIO

**Files:**
- Create: `firmware/platformio.ini`
- Create: `firmware/include/config.h`
- Create: `firmware/src/main.cpp`
- Create: `firmware/.gitignore`

- [ ] **Step 1: Criar `firmware/platformio.ini`**

```ini
; TraduzAI — firmware ESP32-S3 (cliente de tradução)
[env:esp32-s3-devkitc-1]
platform = espressif32
board = esp32-s3-devkitc-1
framework = arduino
monitor_speed = 115200
build_flags =
    -DBOARD_HAS_PSRAM
    -DARDUINO_USB_CDC_ON_BOOT=1
board_build.arduino.memory_type = qio_opi
lib_deps =
    bblanchon/ArduinoJson@^7.2.0
    earlephilhower/ESP8266Audio@^1.9.7

; Ambiente de teste no host (apenas lógica pura, ex.: wav)
[env:native]
platform = native
test_framework = unity
build_flags = -std=gnu++17
```

- [ ] **Step 2: Criar `firmware/.gitignore`**

```gitignore
.pio/
.vscode/
```

- [ ] **Step 3: Criar `firmware/include/config.h` (template)**

```cpp
#pragma once
// ===== TraduzAI — configuração do dispositivo =====
// Preencha os valores e refaça o flash.

// --- Wi-Fi ---
#define WIFI_SSID  "SUA_REDE"
#define WIFI_PASS  "SUA_SENHA"

// --- Backend (a app web em web/) ---
#define SERVER_HOST "192.168.0.10"   // host/IP onde o web/ está servindo
#define SERVER_PORT 443
#define USE_TLS     true             // false p/ http em dev local
#define SERVER_PATH "/api/translate"

// --- Par de idiomas (substitui o setup por voz) ---
#define LANG_A_CODE "en"
#define LANG_A_NAME "English"
#define LANG_B_CODE "it"
#define LANG_B_NAME "Italiano"

// --- Áudio ---
#define SAMPLE_RATE      16000
#define FRAME_SAMPLES    320      // 20 ms @ 16 kHz
#define MAX_UTTERANCE_MS 10000

// --- VAD por energia (calibrar no bring-up) ---
#define VAD_THRESHOLD       500.0f  // limiar de RMS (int16)
#define VAD_START_FRAMES    3       // frames acima do limiar p/ iniciar
#define VAD_HANGOVER_FRAMES 25      // frames abaixo p/ encerrar (~500 ms)

// --- Pinos I2S (ver pinagem no README) ---
#define I2S_MIC_WS   4
#define I2S_MIC_SCK  5
#define I2S_MIC_SD   6
#define I2S_SPK_LRC  7
#define I2S_SPK_BCLK 15
#define I2S_SPK_DIN  16
```

- [ ] **Step 4: Criar `firmware/src/main.cpp` mínimo (compila)**

```cpp
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
```

- [ ] **Step 5: Compilar**

Run: `pio run -d firmware -e esp32-s3-devkitc-1`
Expected: `SUCCESS` (compila e linka).

- [ ] **Step 6: Commit**

```bash
git add firmware/platformio.ini firmware/.gitignore firmware/include/config.h firmware/src/main.cpp
git commit -m "feat(firmware): scaffold PlatformIO do cliente ESP32-S3"
```

---

### Task 1: Módulo `wav` (header WAV) com teste host

**Files:**
- Create: `firmware/src/wav.h`
- Create: `firmware/src/wav.cpp`
- Test: `firmware/test/test_wav/test_wav.cpp`

- [ ] **Step 1: Escrever o teste que falha**

`firmware/test/test_wav/test_wav.cpp`:
```cpp
#include <unity.h>
#include <cstdint>
#include "../../src/wav.h"

void test_header_tem_44_bytes(void) {
  uint8_t buf[44];
  size_t n = writeWavHeader(buf, 16000, 16000); // 16000 amostras, 16 kHz
  TEST_ASSERT_EQUAL_UINT(44, n);
}

void test_magic_riff_e_wave(void) {
  uint8_t buf[44];
  writeWavHeader(buf, 100, 16000);
  TEST_ASSERT_EQUAL_MEMORY("RIFF", buf, 4);
  TEST_ASSERT_EQUAL_MEMORY("WAVE", buf + 8, 4);
  TEST_ASSERT_EQUAL_MEMORY("data", buf + 36, 4);
}

void test_campos_pcm_mono_16bit(void) {
  uint8_t buf[44];
  uint32_t samples = 100;
  uint32_t rate = 16000;
  writeWavHeader(buf, samples, rate);
  auto u16 = [&](int o){ return (uint16_t)(buf[o] | (buf[o+1] << 8)); };
  auto u32 = [&](int o){ return (uint32_t)(buf[o] | (buf[o+1]<<8) | (buf[o+2]<<16) | ((uint32_t)buf[o+3]<<24)); };
  TEST_ASSERT_EQUAL_UINT16(1, u16(20));            // PCM
  TEST_ASSERT_EQUAL_UINT16(1, u16(22));            // mono
  TEST_ASSERT_EQUAL_UINT32(rate, u32(24));         // sample rate
  TEST_ASSERT_EQUAL_UINT32(rate * 2, u32(28));     // byte rate
  TEST_ASSERT_EQUAL_UINT16(2, u16(32));            // block align
  TEST_ASSERT_EQUAL_UINT16(16, u16(34));           // bits/sample
  TEST_ASSERT_EQUAL_UINT32(samples * 2, u32(40));  // data size
  TEST_ASSERT_EQUAL_UINT32(36 + samples * 2, u32(4)); // RIFF chunk size
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_header_tem_44_bytes);
  RUN_TEST(test_magic_riff_e_wave);
  RUN_TEST(test_campos_pcm_mono_16bit);
  return UNITY_END();
}
```

- [ ] **Step 2: Criar header `firmware/src/wav.h`**

```cpp
#pragma once
#include <cstdint>
#include <cstddef>

/**
 * Escreve o header WAV de 44 bytes (PCM 16-bit mono) em out.
 * Espelha web/lib/audio.ts:encodeWAV. Retorna 44.
 */
size_t writeWavHeader(uint8_t* out, uint32_t numSamples, uint32_t sampleRate);
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `pio test -d firmware -e native`
Expected: FAIL (linker não acha `writeWavHeader` — `wav.cpp` não existe ainda).

- [ ] **Step 4: Implementar `firmware/src/wav.cpp`**

```cpp
#include "wav.h"

// Escreve um inteiro little-endian em out[offset..].
static void wr16(uint8_t* o, uint16_t v) { o[0] = v & 0xff; o[1] = (v >> 8) & 0xff; }
static void wr32(uint8_t* o, uint32_t v) {
  o[0] = v & 0xff; o[1] = (v >> 8) & 0xff; o[2] = (v >> 16) & 0xff; o[3] = (v >> 24) & 0xff;
}

size_t writeWavHeader(uint8_t* out, uint32_t numSamples, uint32_t sampleRate) {
  const uint32_t dataBytes = numSamples * 2; // 16-bit mono
  // RIFF
  out[0]='R'; out[1]='I'; out[2]='F'; out[3]='F';
  wr32(out + 4, 36 + dataBytes);
  out[8]='W'; out[9]='A'; out[10]='V'; out[11]='E';
  // fmt
  out[12]='f'; out[13]='m'; out[14]='t'; out[15]=' ';
  wr32(out + 16, 16);            // tamanho do bloco fmt
  wr16(out + 20, 1);             // PCM
  wr16(out + 22, 1);             // mono
  wr32(out + 24, sampleRate);
  wr32(out + 28, sampleRate * 2); // byte rate (mono 16-bit)
  wr16(out + 32, 2);             // block align
  wr16(out + 34, 16);            // bits por amostra
  // data
  out[36]='d'; out[37]='a'; out[38]='t'; out[39]='a';
  wr32(out + 40, dataBytes);
  return 44;
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `pio test -d firmware -e native`
Expected: PASS (3 testes).

- [ ] **Step 6: Compilar o firmware (garante que wav.cpp não quebra o build do device)**

Run: `pio run -d firmware -e esp32-s3-devkitc-1`
Expected: SUCCESS.

- [ ] **Step 7: Commit**

```bash
git add firmware/src/wav.h firmware/src/wav.cpp firmware/test/test_wav/test_wav.cpp
git commit -m "feat(firmware): módulo wav com header WAV testado no host"
```

---

### Task 2: Módulo `audio_capture` (I2S0 + INMP441 + RMS)

**Files:**
- Create: `firmware/src/audio_capture.h`
- Create: `firmware/src/audio_capture.cpp`
- Modify: `firmware/src/main.cpp`

- [ ] **Step 1: Criar `firmware/src/audio_capture.h`**

```cpp
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
```

- [ ] **Step 2: Implementar `firmware/src/audio_capture.cpp`**

```cpp
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
```

- [ ] **Step 3: Bring-up de mic no `main.cpp` (imprime RMS por frame)**

Substituir `firmware/src/main.cpp` por:
```cpp
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
```

- [ ] **Step 4: Compilar**

Run: `pio run -d firmware -e esp32-s3-devkitc-1`
Expected: SUCCESS.

- [ ] **Step 5: Verificação manual (documentar resultado)**

Flash + monitor: `pio run -d firmware -t upload && pio device monitor -d firmware`
Expected: imprime `[mic] rms=...` — valor baixo em silêncio, alto ao falar. Ajustar `VAD_THRESHOLD` no `config.h` conforme observado. (Se exige hardware, registrar como pendente de validação física.)

- [ ] **Step 6: Commit**

```bash
git add firmware/src/audio_capture.h firmware/src/audio_capture.cpp firmware/src/main.cpp
git commit -m "feat(firmware): captura I2S do INMP441 com RMS p/ VAD"
```

---

### Task 3: Módulo `audio_playback` (I2S1 + MAX98357A + decode MP3)

**Files:**
- Create: `firmware/src/audio_playback.h`
- Create: `firmware/src/audio_playback.cpp`
- Modify: `firmware/src/main.cpp`

- [ ] **Step 1: Criar `firmware/src/audio_playback.h`**

```cpp
#pragma once
#include <cstdint>
#include <cstddef>

/** Inicializa a saída I2S1 para o amplificador MAX98357A. */
void speakerBegin();

/** Decoda e toca um buffer MP3 (na PSRAM). Bloqueia até terminar. */
void playMp3(const uint8_t* mp3, size_t len);
```

- [ ] **Step 2: Implementar `firmware/src/audio_playback.cpp`**

```cpp
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
```

- [ ] **Step 3: Bring-up de alto-falante no `main.cpp` (toca MP3 embutido)**

Substituir `firmware/src/main.cpp` por:
```cpp
#include <Arduino.h>
#include "config.h"
#include "audio_playback.h"
#include "test_tone_mp3.h"  // gerado no Step 4

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("[traduzai] bring-up do alto-falante");
  speakerBegin();
  playMp3(TEST_TONE_MP3, TEST_TONE_MP3_LEN);
}

void loop() { delay(1000); }
```

- [ ] **Step 4: Gerar `firmware/src/test_tone_mp3.h` (um beep MP3 curto embutido)**

Gerar com ffmpeg + xxd (requer ffmpeg local):
```bash
ffmpeg -f lavfi -i "sine=frequency=880:duration=1" -ar 16000 -ac 1 -b:a 64k /tmp/tone.mp3
printf '#pragma once\n#include <cstdint>\n#include <cstddef>\n' > firmware/src/test_tone_mp3.h
xxd -i -n TEST_TONE_MP3 /tmp/tone.mp3 | sed 's/unsigned char/const uint8_t/;s/unsigned int/const size_t/' >> firmware/src/test_tone_mp3.h
echo '#define TEST_TONE_MP3_LEN TEST_TONE_MP3_len' >> firmware/src/test_tone_mp3.h
```
Resultado: header com `const uint8_t TEST_TONE_MP3[]`, `const size_t TEST_TONE_MP3_len` e o `#define TEST_TONE_MP3_LEN`.

- [ ] **Step 5: Compilar**

Run: `pio run -d firmware -e esp32-s3-devkitc-1`
Expected: SUCCESS.

- [ ] **Step 6: Verificação manual (documentar resultado)**

Flash + monitor. Expected: log `[spk] tocando MP3` e um beep de 880 Hz no alto-falante. (Pendente de hardware se não disponível.)

- [ ] **Step 7: Commit**

```bash
git add firmware/src/audio_playback.h firmware/src/audio_playback.cpp firmware/src/test_tone_mp3.h firmware/src/main.cpp
git commit -m "feat(firmware): playback I2S com decode MP3 (MAX98357A)"
```

---

### Task 4: Módulo `net` (WiFi + POST multipart + base64 + JSON)

**Files:**
- Create: `firmware/src/net.h`
- Create: `firmware/src/net.cpp`
- Modify: `firmware/src/main.cpp`

- [ ] **Step 1: Criar `firmware/src/net.h`**

```cpp
#pragma once
#include <Arduino.h>
#include <cstdint>
#include <cstddef>

/** Resultado de uma tradução vinda do backend. mp3 é alocado em PSRAM (free pelo caller). */
struct TranslateResult {
  uint8_t* mp3 = nullptr;
  size_t mp3Len = 0;
  String sourceText, sourceLang, targetText, targetLang;
};

/** Conecta ao Wi-Fi (bloqueante, com log). */
void wifiBegin();

/** True se o Wi-Fi está conectado. */
bool wifiConnected();

/**
 * Envia o WAV (já com header) ao backend /api/translate junto com o par de
 * idiomas (de config.h) e o history JSON. Em sucesso preenche out e retorna true.
 */
bool translate(const uint8_t* wav, size_t wavLen, const String& historyJson, TranslateResult& out);
```

- [ ] **Step 2: Implementar `firmware/src/net.cpp`**

```cpp
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
  while (client->connected() || client->available()) {
    while (client->available() && bodyLen < CAP - 1) {
      body[bodyLen++] = (char)client->read();
    }
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
```

- [ ] **Step 3: Bring-up de rede no `main.cpp` (POST com WAV de silêncio)**

Substituir `firmware/src/main.cpp` por:
```cpp
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
```

- [ ] **Step 4: Compilar**

Run: `pio run -d firmware -e esp32-s3-devkitc-1`
Expected: SUCCESS.

- [ ] **Step 5: Verificação manual (documentar resultado)**

Com o `web/` rodando e acessível em `SERVER_HOST`, flash + monitor. Expected: `[wifi] conectado`, `[net] resposta: HTTP/1.1 200`, e log `[net] ok: ...`. (Silêncio pode gerar transcrição vazia — validar com o servidor real; registrar resultado.)

- [ ] **Step 6: Commit**

```bash
git add firmware/src/net.h firmware/src/net.cpp firmware/src/main.cpp
git commit -m "feat(firmware): cliente HTTP multipart p/ /api/translate"
```

---

### Task 5: `main.cpp` — máquina de estados + history ring buffer

**Files:**
- Modify: `firmware/src/main.cpp`

- [ ] **Step 1: Escrever o `main.cpp` final**

Substituir `firmware/src/main.cpp` por:
```cpp
#include <Arduino.h>
#include <ArduinoJson.h>
#include "config.h"
#include "audio_capture.h"
#include "audio_playback.h"
#include "net.h"
#include "wav.h"

// ===== Estados =====
enum class State { IDLE, CAPTURING };
static State state = State::IDLE;

// ===== Buffer da fala em PSRAM (PCM int16) =====
static int16_t* utterance = nullptr;
static const size_t MAX_SAMPLES = (size_t)SAMPLE_RATE * MAX_UTTERANCE_MS / 1000;
static size_t uttLen = 0;

// ===== VAD =====
static int16_t frame[FRAME_SAMPLES];
static int voiceFrames = 0;   // frames acima do limiar
static int silenceFrames = 0; // frames abaixo do limiar

// ===== History (últimos 6 turnos), igual à web =====
static const int HISTORY_MAX = 6;
struct Turn { String role, lang, text; };
static Turn history[HISTORY_MAX];
static int histCount = 0;

static void historyPush(const String& role, const String& lang, const String& text) {
  if (histCount == HISTORY_MAX) {
    for (int i = 1; i < HISTORY_MAX; i++) history[i - 1] = history[i];
    histCount--;
  }
  history[histCount++] = { role, lang, text };
}

static String historyJson() {
  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  for (int i = 0; i < histCount; i++) {
    JsonObject o = arr.add<JsonObject>();
    o["role"] = history[i].role;
    o["lang"] = history[i].lang;
    o["text"] = history[i].text;
  }
  String s;
  serializeJson(doc, s);
  return s;
}

static void sendUtterance() {
  Serial.printf("[sm] enviando fala (%u amostras)\n", (unsigned)uttLen);
  const size_t wavLen = 44 + uttLen * 2;
  uint8_t* wav = (uint8_t*)ps_malloc(wavLen);
  if (!wav) { Serial.println("[sm] sem PSRAM p/ WAV"); return; }
  writeWavHeader(wav, uttLen, SAMPLE_RATE);
  memcpy(wav + 44, utterance, uttLen * 2);

  TranslateResult r;
  bool ok = translate(wav, wavLen, historyJson(), r);
  free(wav);
  if (!ok) { Serial.println("[sm] tradução falhou"); return; }

  historyPush("original", r.sourceLang, r.sourceText);
  historyPush("translation", r.targetLang, r.targetText);

  if (r.mp3 && r.mp3Len) {
    playMp3(r.mp3, r.mp3Len); // mic ignorado durante o playback (loop bloqueado)
    free(r.mp3);
  }
  // Descarta frames acumulados no DMA durante o playback (evita eco).
  for (int i = 0; i < 5; i++) micReadFrame(frame);
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("[traduzai] iniciando");
  utterance = (int16_t*)ps_malloc(MAX_SAMPLES * sizeof(int16_t));
  if (!utterance) { Serial.println("[traduzai] PSRAM insuficiente"); while (true) delay(1000); }
  micBegin();
  speakerBegin();
  wifiBegin();
  Serial.printf("[traduzai] pronto. par: %s <-> %s\n", LANG_A_NAME, LANG_B_NAME);
}

void loop() {
  size_t n = micReadFrame(frame);
  float rms = frameRms(frame, n);

  if (state == State::IDLE) {
    if (rms > VAD_THRESHOLD) {
      if (++voiceFrames >= VAD_START_FRAMES) {
        Serial.println("[sm] fala iniciada");
        state = State::CAPTURING;
        uttLen = 0;
        silenceFrames = 0;
        // Inclui o frame atual.
        memcpy(utterance, frame, n * sizeof(int16_t));
        uttLen = n;
      }
    } else {
      voiceFrames = 0;
    }
    return;
  }

  // CAPTURING
  if (uttLen + n <= MAX_SAMPLES) {
    memcpy(utterance + uttLen, frame, n * sizeof(int16_t));
    uttLen += n;
  }
  bool full = (uttLen + n > MAX_SAMPLES);

  if (rms < VAD_THRESHOLD) silenceFrames++;
  else silenceFrames = 0;

  if (silenceFrames >= VAD_HANGOVER_FRAMES || full) {
    Serial.println(full ? "[sm] fala encerrada (limite)" : "[sm] fala encerrada (silêncio)");
    sendUtterance();
    state = State::IDLE;
    voiceFrames = 0;
    silenceFrames = 0;
  }
}
```

- [ ] **Step 2: Compilar**

Run: `pio run -d firmware -e esp32-s3-devkitc-1`
Expected: SUCCESS.

- [ ] **Step 3: Rodar o teste host (garante que nada quebrou em wav)**

Run: `pio test -d firmware -e native`
Expected: PASS.

- [ ] **Step 4: Verificação manual end-to-end (documentar resultado)**

Com `web/` rodando: flash + monitor. Falar no idioma A → ouvir a tradução no idioma B no alto-falante; e vice-versa. Logs `[sm] fala iniciada`/`encerrada`/`[net] ok`. (Pendente de hardware se indisponível.)

- [ ] **Step 5: Commit**

```bash
git add firmware/src/main.cpp
git commit -m "feat(firmware): máquina de estados VAD->translate->play com history"
```

---

### Task 6: README do firmware

**Files:**
- Create: `firmware/README.md`

- [ ] **Step 1: Escrever `firmware/README.md`**

````markdown
# Firmware ESP32-S3 — TraduzAI

Cliente embarcado que captura a fala, envia ao backend (`web/`, rota
`/api/translate`) e reproduz a tradução. VAD por energia (mãos-livres),
par de idiomas fixo em `config.h`, decode de MP3 no dispositivo.

## Pinagem

**Microfone INMP441 → ESP32-S3 (I2S0):**
| INMP441 | ESP32-S3 |
|---|---|
| VDD | 3.3V (NUNCA 5V) |
| GND | GND |
| L/R | GND |
| WS  | GPIO4 |
| SCK | GPIO5 |
| SD  | GPIO6 |

**Amplificador MAX98357A → ESP32-S3 (I2S1):**
| MAX98357A | ESP32-S3 |
|---|---|
| VIN  | 5V |
| GND  | GND |
| LRC  | GPIO7 |
| BCLK | GPIO15 |
| DIN  | GPIO16 |

Alto-falante 8Ω 1W nos terminais `+`/`−` do MAX98357A.

## Configuração

Edite `include/config.h`: Wi-Fi, `SERVER_HOST`/`SERVER_PORT`/`USE_TLS`,
par de idiomas e (após o bring-up) `VAD_THRESHOLD`.

> O backend é a app `web/`. Garanta que o ESP32 alcança `SERVER_HOST` na rede.

## Build

```bash
pio run -d firmware                 # compila
pio run -d firmware -t upload       # flash
pio device monitor -d firmware      # monitor serial (115200)
pio test -d firmware -e native      # testes host (wav)
```

## Bring-up (ordem recomendada)

1. **Wi-Fi:** conecta e imprime IP.
2. **Microfone:** imprime `[mic] rms=...`. Anote o RMS em silêncio e falando;
   ajuste `VAD_THRESHOLD` para um valor entre os dois.
3. **Alto-falante:** toca um beep MP3 embutido.
4. **Rede:** POST a `/api/translate`; valida `HTTP 200` e `[net] ok`.
5. **End-to-end:** fala no idioma A → tradução no idioma B (e vice-versa).

## Limitações do MVP

- **TLS sem validação de certificado** (`setInsecure()`): só p/ demonstração.
- **Sem cancelamento de eco:** o mic é ignorado durante o playback.
- **Par de idiomas fixo:** trocar exige reflash.

## Troubleshooting

| Sintoma | Causa provável |
|---|---|
| VAD dispara sozinho | `VAD_THRESHOLD` baixo demais |
| Não detecta fala | `VAD_THRESHOLD` alto demais |
| Sem áudio na saída | VIN do MAX98357A não está em 5V; pinos I2S trocados |
| `sem PSRAM` no log | PSRAM não habilitada (ver `platformio.ini`) |
| `connect` falha | `SERVER_HOST`/porta errados ou backend fora do ar |
| Áudio do mic distorcido | ajustar o shift `>>14` em `audio_capture.cpp` |
````

- [ ] **Step 2: Commit**

```bash
git add firmware/README.md
git commit -m "docs(firmware): README com pinagem, build e bring-up"
```

---

## Notas de execução

- O `main.cpp` é reescrito a cada task de bring-up (2, 3, 4) e fica definitivo na Task 5. É intencional: cada bring-up isola um subsistema.
- `test_tone_mp3.h` (Task 3) e a verificação física dependem de hardware/ffmpeg. Onde não houver hardware, marcar os passos de verificação manual como "pendente de validação física" e seguir com a verificação de compilação (`pio run`).
- Tudo em PSRAM: buffer da fala (~320 KB p/ 10 s), corpo HTTP (até 200 KB), MP3 decodado. Por isso `-DBOARD_HAS_PSRAM` + `qio_opi`.
