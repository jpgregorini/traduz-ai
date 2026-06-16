# Spec de Design — Pivô Web do TraduzAI

> Data: 2026-06-15
> Status: aprovado (brainstorming) — pronto para virar plano de implementação

---

## 1. Contexto e pivô

O TraduzAI nasceu como tradutor simultâneo bidirecional com dois clientes (hardware ESP32-S3 e app Android Kotlin) conectados a um backend FastAPI na VM Hetzner.

**Este pivô substitui o hardware pelo próprio celular do usuário.** Em vez do ESP32, qualquer pessoa abre um **web app** (Next.js hospedado na Vercel) no navegador do celular e faz a tradução simultânea ali — exatamente a função que o firmware do ESP32 faria, mas sem hardware dedicado.

### Diferencial vs Google Tradutor
O app **leva o contexto da conversa em conta na hora de traduzir**. O histórico recente dos turnos entra no prompt do modelo de tradução, resolvendo pronomes, termos técnicos, gírias e nível de formalidade que um tradutor "frase a frase" erra.

### Adaptativo a qualquer idioma
Não há lista fixa de idiomas. O usuário **fala** quais dois idiomas vai usar; o sistema mapeia para códigos ISO e roteia automaticamente daí em diante.

---

## 2. Objetivos

- Web app single-screen, mobile-first, que roda no navegador do celular.
- Tradução simultânea bidirecional **texto + voz** entre dois idiomas.
- Configuração dos dois idiomas **por voz**.
- Escuta **hands-free** (VAD detecta início/fim da fala).
- Tradução **com contexto da conversa** (diferencial central).
- Suporte a **qualquer par de idiomas** que Whisper/GPT/TTS cobrem.
- Latência por fala dentro da meta MVP de **3 segundos**.
- Chave da OpenAI **nunca** exposta no navegador.

## 3. Não-objetivos (YAGNI / Fase 2)

- Login, contas, banco de dados.
- Persistência da conversa entre sessões.
- Streaming progressivo de TTS.
- OpenAI Realtime API (speech-to-speech).
- Salas multi-dispositivo.
- O firmware ESP32 e o app Android nativo continuam no roadmap original, mas **fora do escopo deste spec**.

---

## 4. Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Hospedagem | Vercel |
| UI | React + Tailwind |
| VAD (navegador) | `@ricky0123/vad-web` (Silero VAD via onnxruntime-web) |
| Captura de áudio | `getUserMedia` (gerenciado pela lib de VAD) |
| STT | OpenAI `gpt-4o-transcribe` (detecta idioma) |
| Tradução | OpenAI `gpt-4o-mini` (com contexto) |
| TTS | OpenAI `gpt-4o-mini-tts` |
| SDK servidor | `openai` (Node) |

Decisão de arquitetura: **pipeline em etapas** (Whisper → GPT → TTS) em rotas serverless, escolhido sobre a Realtime API por simplicidade, custo, controle total do contexto e por mapear 1:1 no pipeline já documentado no `CLAUDE.md`. Realtime fica para a Fase 2 (meta ≤1s).

---

## 5. Arquitetura e componentes

Cada unidade tem uma responsabilidade clara, interface definida e é testável isoladamente.

### 5.1 Cliente (React)

**`useMicVAD` (hook)**
- O que faz: encapsula `@ricky0123/vad-web`; escuta o microfone e emite o áudio de cada fala detectada.
- Interface: `start()`, `stop()`, callback `onSpeechEnd(audio: Float32Array)`; expõe estado `listening`.
- Depende de: `@ricky0123/vad-web`, permissão de microfone.

**`useConversation` (hook / máquina de estados)**
- O que faz: orquestra o ciclo de vida da sessão.
- Estados: `IDLE` → `SETUP` (capturando os dois idiomas) → `ACTIVE` (loop de tradução) → (`ERROR` transitório).
- Mantém: par de idiomas `{ langA, langB }`, histórico de turnos, estado de processamento atual.
- Interface: `begin()`, `reset()`, `toggleMute()`; expõe `state`, `languagePair`, `turns`, `status`.

**Tela única (componente de página)**
- Botão grande central (inicia / reflete o estado).
- Indicador de estado: `ouvindo` / `transcrevendo` / `traduzindo` / `falando`.
- Par de idiomas no topo (ex.: `PT ⇄ EN`).
- Balões da conversa (fala original + tradução, lado a lado ou empilhados).
- Toggle de mudo (silencia o TTS, mantém o texto).

**Player de áudio**
- O que faz: toca o áudio TTS retornado (base64 → `Audio`/Web Audio).
- Respeita o toggle de mudo.

### 5.2 Servidor (rotas serverless Next.js)

A chave da OpenAI vive só no servidor. O cliente nunca fala direto com a OpenAI.

**`POST /api/setup-languages`**
- Request: `multipart/form-data` com `audio` (a pessoa falando algo como "português e inglês").
- Processo: transcreve o áudio → GPT extrai os dois idiomas em ISO 639-1 + nome de exibição.
- Response (JSON):
  ```ts
  {
    langA: { code: string; name: string }, // ex.: { code: "pt", name: "Português" }
    langB: { code: string; name: string }
  }
  ```
- Erro: se não identificar dois idiomas, retorna `422` com motivo para o cliente pedir repetição.

**`POST /api/translate`**
- Request: `multipart/form-data` com `audio` (a fala) + campos `langA`, `langB` (JSON) + `history` (JSON, últimos ~6 turnos).
- Processo:
  1. Transcreve o áudio (detecta idioma de origem).
  2. Decide o idioma alvo (ver regra de roteamento).
  3. GPT traduz a última fala **usando o histórico como contexto**.
  4. TTS sintetiza a tradução.
- Response (JSON):
  ```ts
  {
    sourceText: string,
    sourceLang: string,    // ISO detectado
    targetText: string,
    targetLang: string,    // ISO alvo
    audioBase64: string    // MP3 da tradução
  }
  ```
- Erro: `4xx/5xx` com mensagem; a sessão no cliente sobrevive e tenta na próxima fala.

> Uma chamada cliente→servidor por fala; as três chamadas à OpenAI ficam encapsuladas no servidor para reduzir round-trips e manter a chave protegida.

---

## 6. Fluxos

### 6.1 Setup por voz
```
IDLE → usuário aperta o botão
 → cliente mostra "Diga os dois idiomas que vocês vão usar"
 → captura uma fala (ex.: "português e inglês")
 → POST /api/setup-languages
 → recebe { langA, langB } → mostra "PT ⇄ EN" → entra em ACTIVE
 (se 422 → "Não entendi, repita os dois idiomas")
```

### 6.2 Loop de tradução (ACTIVE)
```
VAD detecta fim da fala
 → POST /api/translate { audio, langA, langB, history[~6 últimos] }
 → servidor: transcribe → detecta idioma → escolhe alvo → GPT traduz(contexto) → TTS
 → cliente recebe { sourceText, targetText, sourceLang, targetLang, audioBase64 }
 → adiciona turno ao histórico/balões, toca o áudio (se não-mudo)
 → VAD continua ouvindo (sem ação manual)
```

### 6.3 Regra de roteamento de idioma
```
detectado == langA.code  → alvo = langB
detectado == langB.code  → alvo = langA
detectado == outro       → alvo = langB (padrão) + aviso sutil "idioma inesperado"
```

---

## 7. Contexto da conversa (o diferencial)

- O cliente mantém um array de turnos: `{ role: "original" | "translation", lang, text }`.
- A cada tradução, os últimos ~6 turnos são enviados ao GPT.
- Esboço do prompt de tradução (servidor):
  > "Você é um intérprete simultâneo. Use o histórico da conversa como contexto. Traduza apenas a última fala de `{origem}` para `{alvo}`, preservando tom, nomes próprios, termos do domínio e nível de formalidade. Responda só com a tradução, sem comentários."
- A janela de contexto (~6 turnos) é configurável; mantida curta para conter custo e latência.

---

## 8. Tratamento de erros e bordas

| Situação | Comportamento |
|---|---|
| Permissão de microfone negada | Mensagem clara + botão de retry |
| Fala vazia / disparo falso do VAD | Ignora, continua ouvindo |
| Erro de API (rate limit, rede) | Toast; sessão sobrevive; tenta na próxima fala |
| Setup não identificou 2 idiomas | Pede para repetir |
| Idioma detectado fora do par | Roteia para `langB` + aviso sutil |
| Timeout de função serverless | `maxDuration` configurado na rota |

---

## 9. Segurança e privacidade

- `OPENAI_API_KEY` apenas em variável de ambiente da Vercel (server-side); fora do bundle do cliente.
- HTTPS nativo da Vercel cobre o requisito de transporte seguro (equivalente ao WSS do projeto original).
- Áudio processado em memória e **descartado** após a resposta — sem persistência, conforme regra do `CLAUDE.md`.

---

## 10. Testes

- **Unit (funções puras):** roteamento de idioma (`detectado → alvo`), montagem do prompt, parsing do setup. Cobertura via TDD.
- **Rotas API:** cliente OpenAI mockado; testar orquestração e caminhos de erro.
- **VAD / E2E:** teste manual no celular (a validação real).
- Implementação segue TDD (superpowers).

---

## 11. Estrutura de pastas (proposta)

```
traduzAI/
├── CLAUDE.md
├── docs/superpowers/specs/2026-06-15-traduzai-web-pivot-design.md
└── web/                      # app Next.js
    ├── app/
    │   ├── page.tsx          # tela única
    │   └── api/
    │       ├── setup-languages/route.ts
    │       └── translate/route.ts
    ├── lib/
    │   ├── routing.ts        # regra de idioma (puro, testável)
    │   ├── prompt.ts         # montagem de prompt (puro, testável)
    │   └── openai.ts         # cliente + chamadas STT/translate/TTS
    ├── hooks/
    │   ├── useMicVAD.ts
    │   └── useConversation.ts
    ├── components/
    └── .env.example          # OPENAI_API_KEY=
```

> Git: `traduzAI/` recebe `git init` próprio (hoje o git root é `/Users/jpgregorini`, a home inteira — evitar poluir). O app Next.js vive em `traduzAI/web/`.

---

## 12. Latência (orçamento estimado)

| Etapa | Tempo |
|---|---|
| VAD fim da fala → upload | 150–300ms |
| Transcrição (STT) | 500–1000ms |
| Tradução (GPT, com contexto) | 300–600ms |
| TTS | 500–800ms |
| Download + tocar | 200ms |
| **Total** | **~1.5–2.7s** (dentro da meta de 3s) |

---

## 13. Roadmap Fase 2 (pós-MVP)

- Migrar para OpenAI Realtime API (speech-to-speech, meta ≤1s).
- Streaming progressivo de TTS.
- PWA instalável + funcionamento offline parcial.
- Persistência opcional de preferências de idioma.
