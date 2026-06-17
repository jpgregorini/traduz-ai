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
