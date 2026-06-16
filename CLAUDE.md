# CLAUDE.md — Projeto TraduzAI

> Contexto completo do projeto para uso no Claude Code. Este arquivo deve ficar na raiz do repositório.

---

## Visão Geral

**TraduzAI** é um projeto extensionista da faculdade (UNIVAG, Cuiabá/MT) que entrega duas soluções complementares para tradução simultânea baseada em Inteligência Artificial:

1. **Dispositivo de hardware** portátil (tamanho de lapela) baseado em ESP32-S3.
2. **Aplicativo Android nativo** em Kotlin que cumpre a mesma função usando o microfone e alto-falante do celular.

Ambos os clientes se conectam ao **mesmo backend** rodando em uma VM Hetzner, que orquestra o pipeline de IA (Whisper → Tradução → ElevenLabs).

### Funcionamento
O usuário configura dois idiomas (ex: inglês e italiano). Quando o dispositivo escuta inglês, reproduz a tradução em italiano. Quando escuta italiano, reproduz em inglês. Bidirecional, automático, em até 3 segundos.

### Equipe
- João Pedro Gregorini ([@jpgregorini](https://github.com/jpgregorini))
- Murilo Espirito Santo

### Repositório
https://github.com/jpgregorini/traduzAI

---

## Arquitetura

```
┌──────────────────┐     WebSocket (WSS)     ┌────────────────────────────┐
│  Cliente A       │ ◄─────────────────────► │   Servidor FastAPI         │
│  Hardware ESP32  │                          │   VM Hetzner — Ubuntu 22   │
│  (firmware C++)  │                          │                            │
└──────────────────┘                          │   Pipeline:                │
                                              │   1. Silero VAD (local)    │
┌──────────────────┐     WebSocket (WSS)     │   2. OpenAI Whisper (API)  │
│  Cliente B       │ ◄─────────────────────► │   3. LLM tradução (API)    │
│  App Android     │                          │   4. ElevenLabs TTS (API)  │
│  (Kotlin)        │                          │                            │
└──────────────────┘                          └────────────────────────────┘
```

---

## Stack Técnica Completa

| Camada | Tecnologia |
|---|---|
| **Microcontrolador** | ESP32-S3 DevKitC-1 |
| **Microfone (hardware)** | INMP441 (I2S) |
| **Amplificador (hardware)** | MAX98357A (I2S) |
| **Alto-falante** | 8Ω 1W 56mm |
| **Bateria** | LiPo 3.7V 600mAh + conector JST PH 2.0 |
| **Firmware** | C++ com Arduino Framework |
| **Protocolo** | WebSocket (WSS) |
| **Backend** | Python 3.11 + FastAPI |
| **Servidor ASGI** | Uvicorn |
| **Hospedagem** | VM Hetzner (Falkenstein, DE) — Ubuntu 22.04 |
| **STT** | OpenAI Whisper API (modelo `whisper-1`) |
| **VAD** | Silero VAD (local, no servidor) |
| **Tradução** | LLM via API (Claude Haiku ou GPT-4o-mini) |
| **TTS** | ElevenLabs API (streaming, `optimize_streaming_latency=3`) |
| **App móvel** | Kotlin nativo + Android Studio |
| **Captura áudio (Android)** | AudioRecord API |
| **Reprodução áudio (Android)** | AudioTrack API |
| **WebSocket client (Android)** | OkHttp |

---

## Hardware

### Componentes adquiridos
- 1× ESP32-S3 DevKitC-1
- 1× INMP441 (microfone digital I2S)
- 1× MAX98357A (amplificador I2S)
- 1× Alto-falante 56mm 8Ω 1W
- 1× Bateria LiPo 3.7V 600mAh JST PH 2.0
- 1× Push button
- 1× Protoboard
- Jumpers macho-macho e macho-fêmea

### Pinagem definitiva

**Microfone INMP441 → ESP32-S3:**
| INMP441 | ESP32-S3 | Função |
|---|---|---|
| VDD | 3.3V | Alimentação (NUNCA 5V) |
| GND | GND | Terra |
| L/R | GND | Define canal esquerdo |
| WS | GPIO 4 | Word Select |
| SCK | GPIO 5 | Bit Clock |
| SD | GPIO 6 | Serial Data |

**Amplificador MAX98357A → ESP32-S3:**
| MAX98357A | ESP32-S3 | Função |
|---|---|---|
| VIN | 5V | Alimentação (5V para volume adequado) |
| GND | GND | Terra |
| LRC | GPIO 7 | Word Select |
| BCLK | GPIO 15 | Bit Clock |
| DIN | GPIO 16 | Serial Data |
| GAIN | NC | Ganho padrão 9dB |
| SD | NC | Sempre ativo |

**Push button:**
- GPIO 0 → GND (com debounce no firmware)

**Alto-falante:**
- Soldado nos terminais `+` e `−` do MAX98357A

### Formato de áudio padrão
- **Sample rate:** 16 kHz
- **Bit depth:** 16-bit
- **Canais:** mono
- **Formato:** PCM raw

---

## Backend (Servidor)

### Estrutura de diretórios

```
translator-server/
├── main.py                 # FastAPI app + WebSocket handler
├── config.py               # Configurações e variáveis de ambiente
├── requirements.txt
├── services/
│   ├── __init__.py
│   ├── vad.py              # Silero VAD — detecção de voz
│   ├── stt.py              # OpenAI Whisper — speech to text
│   ├── translation.py      # Tradução via LLM
│   └── tts.py              # ElevenLabs — text to speech streaming
├── audio/
│   ├── __init__.py
│   └── processing.py       # Conversão de formatos, resampling
└── .env                    # API keys (NUNCA commitar)
```

### Pipeline de processamento

```
Áudio recebido do cliente
        │
        ▼
[Silero VAD]            → detecta fim da fala
        │
        ▼
[OpenAI Whisper API]    → texto + idioma detectado
        │
        ▼
[Tradução via LLM]      → texto traduzido para idioma alvo
        │
        ▼
[ElevenLabs streaming]  → áudio sintetizado (chunks progressivos)
        │
        ▼
Áudio devolvido ao cliente em streaming
```

### Lógica de detecção de idioma

```python
# Configuração da sessão recebida do cliente
config = { "lang_a": "en", "lang_b": "it" }

# Whisper retorna o idioma detectado automaticamente
detected_lang = whisper_result["language"]  # "en"
text = whisper_result["text"]

# Determina o idioma de destino
if detected_lang == config["lang_a"]:
    target_lang = config["lang_b"]
else:
    target_lang = config["lang_a"]
```

### Variáveis de ambiente (`.env`)

```env
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
LLM_PROVIDER=openai          # ou "anthropic"
ANTHROPIC_API_KEY=sk-ant-...
SERVER_HOST=0.0.0.0
SERVER_PORT=8000
```

### Dependências (`requirements.txt`)

```
fastapi>=0.104.0
uvicorn>=0.24.0
websockets>=12.0
openai>=1.0.0
elevenlabs>=1.0.0
httpx>=0.25.0
python-dotenv>=1.0.0
numpy>=1.24.0
soundfile>=0.12.0
silero-vad>=4.0.0
```

---

## Firmware (ESP32-S3)

### Stack
- C++ com Arduino Framework
- Bibliotecas: `WiFi.h`, `WebSocketsClient.h`, `driver/i2s.h`

### Fluxo do firmware

```
1. Boot → Conecta Wi-Fi (SSID/senha em config)
2. Abre WebSocket WSS com o servidor
3. Envia config inicial: { "type": "config", "lang_a": "en", "lang_b": "it" }
4. Loop principal:
   a. Detecta pressão do botão (GPIO 0)
   b. Captura áudio do INMP441 via I2S (chunks ~200ms)
   c. Envia chunks via WebSocket (binário)
   d. Recebe áudio traduzido em streaming
   e. Reproduz no MAX98357A via I2S
```

### Formato de mensagens WebSocket

**ESP32 → Servidor:**
```json
// Configuração inicial (texto)
{ "type": "config", "lang_a": "en", "lang_b": "it" }

// Chunks de áudio (binário) — PCM 16-bit 16kHz mono
```

**Servidor → ESP32:**
```json
// Status (texto)
{ "type": "status", "message": "ready" }

// Áudio traduzido (binário) — PCM ou MP3
```

---

## Aplicativo Android

### Stack
- **Linguagem:** Kotlin
- **IDE:** Android Studio
- **Captura de áudio:** `AudioRecord` API (nativa)
- **Reprodução:** `AudioTrack` API (nativa)
- **WebSocket:** OkHttp WebSocket
- **Min SDK:** Android 8.0 (API 26)

### Interface
Tela única com:
- Dois seletores de idioma (idioma A e idioma B)
- Botão central grande para ativar a escuta
- Indicador visual (ouvindo / processando / reproduzindo)

### Configurações de áudio
- **Sample rate:** 16000 Hz
- **Channel:** MONO
- **Encoding:** PCM 16-bit
- **Buffer:** chunks de ~200ms

---

## Latência

### MVP (meta atual)
**Total: até 3 segundos** do fim da fala até o início da reprodução do áudio traduzido.

| Etapa | Tempo estimado |
|---|---|
| Upload áudio (cliente → server) | 150–300ms |
| Whisper API (STT) | 500–1000ms |
| Tradução (LLM API) | 300–600ms |
| ElevenLabs TTS (1º chunk) | 500–800ms |
| Download áudio (server → cliente) | 100–200ms |
| **Total** | **1.5–2.9s** |

### Otimizações futuras (pós-MVP, meta de ~1s)
1. **Faster-Whisper local** na VM (CTranslate2) — elimina latência de rede com OpenAI
2. **NLLB-200 local** para tradução — elimina latência de rede com LLM
3. **Streaming com VAD no cliente** — servidor já tem o áudio quando a fala termina
4. **ElevenLabs com `optimize_streaming_latency=4`**
5. **VM com GPU** (Hetzner GEX) para inferência rápida

---

## Decisões Técnicas Tomadas

### Por que ESP32-S3
- Wi-Fi e Bluetooth integrados
- Suporte nativo a I2S (essencial para microfone e amplificador digitais)
- Dual-core 240MHz com 8MB PSRAM (suficiente para buffer de áudio)
- USB-C nativo
- Custo baixo (R$70-90)

### Por que XIAO foi abandonado
A primeira escolha foi o **Seeed XIAO ESP32-S3 Sense** (com microfone e gerenciamento de bateria integrados, 21×17mm). Foi comprado pela loja oficial Seeed na China, mas a encomenda foi **taxada em R$600 pela alfândega**, inviabilizando essa opção. Voltamos ao ESP32-S3 DevKitC-1 + módulos separados (INMP441 + MAX98357A) comprados de vendedores nacionais com pronta entrega.

### Por que aplicativo Android paralelo ao hardware
Após o problema com a importação do XIAO, foi adicionado um app Android para:
1. Ter um cliente funcional independente do hardware
2. Facilitar demonstrações (banca acadêmica, pitch)
3. Reaproveitar 100% do backend
4. Permitir validação do pipeline de IA antes do hardware estar pronto

### Por que Kotlin nativo (e não Flutter/React Native)
Acesso ao microfone com baixa latência via `AudioRecord` é muito mais confiável na API nativa Android. Frameworks cross-platform adicionam abstrações que complicam streaming de áudio em tempo real.

### Por que WebSocket (e não HTTP)
Conexão persistente, latência menor, suporte a streaming bidirecional, ideal para áudio em tempo real.

### Por que Whisper da OpenAI (e não local no MVP)
Para o MVP, a API é mais simples de integrar e tem qualidade superior. A latência adicional (~500ms) está dentro da meta de 3s. Migração para Faster-Whisper local fica para a fase de otimização.

### Por que ElevenLabs (e não Google TTS / Azure)
Qualidade de voz superior, naturalidade de entonação, suporte nativo a streaming progressivo.

### Por que VM Hetzner em Falkenstein
- Custo baixo (~€7-15/mês)
- Datacenter próximo ao da ElevenLabs (Europa) → menor latência de API
- João Pedro já tem stack rodando lá (n8n, Evolution API, FastAPI)

---

## Restrições e Convenções

### Restrições de hardware
- O INMP441 **só funciona em 3.3V** — alimentar com 5V queima.
- O MAX98357A **deve ser alimentado em 5V** para volume adequado (funciona em 3.3V, mas com volume baixo).
- A bateria LiPo 600mAh dá **autonomia de ~3 horas** de uso contínuo.

### Convenções de código
- **Firmware:** seguir convenções Arduino (camelCase, `setup()` e `loop()`)
- **Backend Python:** PEP 8, type hints obrigatórios, docstrings em português
- **Android:** seguir convenções Kotlin (camelCase, Compose se possível)
- **Mensagens WebSocket:** JSON com campo `type` obrigatório
- **Idiomas dos comentários:** português brasileiro
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, etc.)

### Restrições de segurança
- API keys **nunca** em código — sempre em `.env` (que está no `.gitignore`)
- Comunicação cliente-servidor **sempre** via WSS (WebSocket Secure)
- Áudio do usuário **não** é persistido no servidor após o processamento

---

## Roadmap

### Fase 1 — MVP (atual)
- [x] Definição de arquitetura
- [x] Aquisição de componentes
- [ ] Montagem do dispositivo em protoboard
- [ ] Firmware básico — captura e envio de áudio via WebSocket
- [ ] Backend FastAPI com pipeline Whisper → LLM → ElevenLabs
- [ ] App Android com interface mínima
- [ ] Teste end-to-end com latência ≤ 3s

### Fase 2 — Otimização
- [ ] Migração para Faster-Whisper local
- [ ] Avaliar NLLB-200 local para tradução
- [ ] Streaming com VAD no cliente
- [ ] Reduzir latência para ≤ 1s

### Fase 3 — Produto
- [ ] Migrar de protoboard para PCB customizada
- [ ] Case 3D-printed para o dispositivo
- [ ] Configuração de idiomas por voz (sem app companion)
- [ ] Persistência de preferências do usuário

---

## Comandos Úteis

### Backend
```bash
# Setup inicial
git clone https://github.com/jpgregorini/traduzAI
cd traduzAI/server
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # preencher com API keys

# Rodar em dev
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Rodar em produção (na VM)
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
```

### Firmware (PlatformIO recomendado)
```bash
cd traduzAI/firmware
pio run                    # compila
pio run --target upload    # faz upload para o ESP32
pio device monitor         # monitor serial
```

### Android
```bash
cd traduzAI/android
./gradlew assembleDebug
./gradlew installDebug
```

---

## Contexto Pessoal do Desenvolvedor (João Pedro)

- Estudante de graduação na UNIVAG, Cuiabá/MT
- Brasileiro, comunicação em português
- Desenvolve workflows n8n e automações com IA profissionalmente (LUMELI, ASCOP, Novalog)
- Tem VM Hetzner em uso com stack n8n, Evolution API, FastAPI
- Familiar com Git/GitHub, Python, JavaScript, C++ básico
- Experiência prévia com hardware: lapela de tradução simultânea (mesmo projeto, fase de pesquisa anterior), sistema de roteamento Python (faculdade)

---

## Notas para o Claude Code

- Quando criar código, **sempre** comentar em português brasileiro.
- Priorizar **clareza e legibilidade** sobre micro-otimizações no MVP.
- Sempre que possível, fornecer **logs descritivos** para facilitar debug (este é um projeto educacional).
- Evitar dependências obscuras — preferir bibliotecas mantidas e bem documentadas.
- Ao sugerir mudanças, considerar que componentes de hardware **já foram comprados** e **não serão trocados** (ex: não sugerir trocar o ESP32-S3 por outro chip).
- A meta de latência do MVP é **3 segundos**. Otimização agressiva fica para fase 2.
- O projeto é **acadêmico** — pode ser que o professor peça documentação adicional, diagramas, ou ajustes na arquitetura. Estar preparado para refatorações motivadas por requisitos pedagógicos.
