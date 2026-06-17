# Firmware ESP32-S3 — Cliente de Tradução Simultânea

> Design aprovado em 2026-06-17. Porta o cliente da plataforma web para o
> dispositivo de hardware ESP32-S3, reusando 100% do backend existente.

## Objetivo

Criar a pasta `firmware/` com um cliente embarcado que replica o loop de
tradução da aplicação web (`web/`). O dispositivo captura a fala, envia ao
backend Next.js existente e reproduz a tradução em áudio — sem nenhuma
alteração no `web/`.

## Contexto: como a web funciona hoje

A arquitetura real **não** é o WebSocket descrito no `CLAUDE.md`. É HTTP
request/response com VAD no cliente:

- **VAD no browser** (`@ricky0123/vad-web`) delimita cada fala.
- `POST /api/translate` — multipart com:
  - `audio`: arquivo WAV 16-bit mono 16 kHz
  - `pair`: JSON `{ langA: {code,name}, langB: {code,name} }`
  - `history`: JSON com os últimos turnos (`web` envia os últimos 6)
  - **Resposta** JSON: `{ sourceText, sourceLang, targetText, targetLang, audioBase64 }`
    onde `audioBase64` é um **MP3 em base64**.
- `POST /api/setup-languages` — define o par por voz (a primeira fala).

O firmware replica o fluxo da fase ACTIVE. A fase SETUP é substituída por
um par de idiomas fixo em `config.h` (mais simples para embarcado).

## Decisões de design (aprovadas)

| Tema | Decisão | Motivo |
|---|---|---|
| Trigger da fala | VAD por energia (RMS), mãos-livres | Sem modelo pesado; hardware não precisa de botão para falar |
| Playback | Decodificar MP3 no próprio ESP32 | Reusa o backend 100%, sem mudar o `web/` |
| Par de idiomas | Fixo em `config.h` | Simples para embarcado; troca exige reflash |
| Build | PlatformIO | Recomendado no `CLAUDE.md`, reprodutível |
| History | Ring buffer dos últimos 6 turnos em RAM | Igual à web, melhora a qualidade da tradução |
| TLS | `WiFiClientSecure::setInsecure()` no MVP | Aceitável para projeto acadêmico; documentado |
| Eco | Mic ignorado durante o playback | Sem cancelamento de eco real no MVP |

## Estrutura de arquivos

```
firmware/
├── platformio.ini          # board esp32-s3-devkitc-1, PSRAM, libs
├── include/
│   └── config.h            # WiFi, URL do server, par de idiomas, pinos, VAD
├── src/
│   ├── main.cpp            # setup() + loop(): máquina de estados
│   ├── audio_capture.h
│   ├── audio_capture.cpp   # I2S0 INMP441 + VAD por energia (RMS)
│   ├── audio_playback.h
│   ├── audio_playback.cpp  # I2S1 MAX98357A + decode MP3
│   ├── net.h
│   ├── net.cpp             # WiFi, POST multipart, parse JSON, base64-decode
│   ├── wav.h
│   └── wav.cpp             # monta header WAV 16k mono 16-bit
└── README.md               # pinagem, build, bring-up, troubleshooting
```

## Dependências (platformio.ini)

- `bblanchon/ArduinoJson` — monta `pair`/`history`, parseia a resposta
- `earlephilhower/ESP8266Audio` — decode MP3 (`AudioGeneratorMP3` lendo de um
  source de buffer em PSRAM) → saída I2S no MAX98357A

Board: `esp32-s3-devkitc-1`. Flags: PSRAM habilitada (`-DBOARD_HAS_PSRAM`),
partição com espaço para o decoder MP3.

## Pinagem (do CLAUDE.md)

**Mic INMP441 → I2S0:** WS=GPIO4, SCK=GPIO5, SD=GPIO6, L/R→GND, VDD=3.3V (nunca 5V).

**Amp MAX98357A → I2S1:** LRC=GPIO7, BCLK=GPIO15, DIN=GPIO16, VIN=5V, GAIN=NC, SD=NC.

> ESP32-S3 tem 2 periféricos I2S — mic em I2S0, alto-falante em I2S1.

## Formato de áudio

- Captura: PCM 16-bit mono 16 kHz (raw do I2S, ajustado do sample de 32-bit do INMP441).
- Envio: WAV (header de 44 bytes + PCM), idêntico ao `web/lib/audio.ts:encodeWAV`.
- Recepção: MP3 base64 → decodado para I2S na saída.

## Máquina de estados (loop principal)

```
IDLE
  └─ lê frames I2S do mic continuamente, calcula RMS
  └─ [RMS > VAD_THRESHOLD por VAD_START_FRAMES] → CAPTURING

CAPTURING
  └─ acumula PCM em buffer PSRAM (limite MAX_UTTERANCE_MS)
  └─ [RMS < VAD_THRESHOLD por VAD_HANGOVER_FRAMES] → SENDING
  └─ [estouro de MAX_UTTERANCE_MS] → SENDING

SENDING
  └─ monta WAV a partir do buffer
  └─ POST /api/translate (audio + pair[config] + history[ring buffer])
  └─ parseia JSON → base64-decode audioBase64 → MP3 em PSRAM → PLAYING
  └─ [erro de rede/HTTP] → log serial → IDLE

PLAYING
  └─ decoda MP3 e toca no I2S1 (mic ignorado p/ evitar eco)
  └─ append em history { original, translation }, mantém últimos 6
  └─ IDLE
```

## config.h (preenchido pelo usuário)

```cpp
// Wi-Fi
#define WIFI_SSID      "..."
#define WIFI_PASS      "..."

// Backend (a app web em web/)
#define SERVER_HOST    "..."          // host/IP onde o web/ está servindo
#define SERVER_PORT    443
#define USE_TLS        true
#define SERVER_PATH    "/api/translate"

// Par de idiomas (substitui o setup por voz)
#define LANG_A_CODE    "en"
#define LANG_A_NAME    "English"
#define LANG_B_CODE    "it"
#define LANG_B_NAME    "Italiano"

// Áudio
#define SAMPLE_RATE        16000
#define MAX_UTTERANCE_MS   10000

// VAD por energia (ajustar no bring-up)
#define VAD_THRESHOLD        ...      // limiar de RMS
#define VAD_START_FRAMES     ...      // frames acima do limiar p/ iniciar
#define VAD_HANGOVER_FRAMES  ...      // frames abaixo p/ encerrar

// Pinos I2S (ver pinagem acima)
#define I2S_MIC_WS   4
#define I2S_MIC_SCK  5
#define I2S_MIC_SD   6
#define I2S_SPK_LRC  7
#define I2S_SPK_BCLK 15
#define I2S_SPK_DIN  16
```

## Tratamento de erros

- Falha de Wi-Fi: reconecta com backoff, log no serial.
- HTTP != 200 ou JSON inválido: descarta a fala, log no serial, volta a IDLE.
- Buffer cheio: encerra a captura e envia o que tem.
- Logs descritivos no serial em todas as transições (projeto educacional).

## Testes

Embarcado não tem unit test trivial. Estratégia:

- `wav.cpp` é lógica pura (bytes) — teste host opcional compilável em desktop.
- Demais módulos: plano de bring-up por serial documentado no README:
  1. Wi-Fi conecta e imprime IP.
  2. Mic: imprime RMS por frame; calibrar `VAD_THRESHOLD` falando/em silêncio.
  3. Alto-falante: toca um MP3 de teste embutido.
  4. Rede: POST a `/api/translate` com WAV fixo; valida JSON de resposta.
  5. End-to-end: fala → tradução tocada.

## Limitações conhecidas do MVP

- **TLS sem validação de certificado** (`setInsecure()`). Suficiente para
  demonstração acadêmica; produção exigiria pinning ou CA bundle.
- **Sem cancelamento de eco**: o mic é apenas silenciado durante o playback.
- **Par de idiomas fixo**: trocar exige reflash (setup por voz fica para depois).

## Fora de escopo

- Alterações no `web/`.
- Setup de idiomas por voz no dispositivo.
- Gerenciamento de bateria/economia de energia.
- Botão push (hardware existe, mas VAD por energia dispensa para falar).
