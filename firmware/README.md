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

> **macOS — pyexpat quebrado:** se o `pio` falhar com `Symbol not found:
> _XML_SetAllocTrackerActivationThreshold` (pyexpat do Python bundle), rode
> com o expat do Homebrew no path:
> `DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib pio run -d firmware`

## Bring-up (ordem recomendada)

1. **Wi-Fi:** conecta e imprime IP.
2. **Microfone:** imprime `[mic] rms=...`. Anote o RMS em silêncio e falando;
   ajuste `VAD_THRESHOLD` para um valor entre os dois.
3. **Alto-falante:** toca um beep MP3 embutido.
4. **Rede:** POST a `/api/translate`; valida `HTTP 200` e `[net] ok`.
5. **End-to-end:** fala no idioma A → tradução no idioma B (e vice-versa).

> Cada etapa de bring-up tem um `main.cpp` próprio no histórico de commits
> (Tasks 2–4). O `main.cpp` atual é o fluxo definitivo (máquina de estados).
> Para reexecutar um bring-up isolado, restaure o `main.cpp` do commit
> correspondente.

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
