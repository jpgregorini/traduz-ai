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
