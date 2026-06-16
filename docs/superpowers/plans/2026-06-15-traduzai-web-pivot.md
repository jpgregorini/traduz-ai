# TraduzAI Web — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web app mobile-first (Next.js/Vercel) que faz tradução simultânea bidirecional por voz no navegador do celular, com contexto de conversa.

**Architecture:** Cliente React captura mic com VAD no browser; a cada fala manda áudio (WAV) para rotas serverless Next.js. Pipeline server: OpenAI STT → GPT-4o-mini (detecta idioma de origem + traduz com histórico) → OpenAI TTS. Volta texto + áudio base64. Chave OpenAI só no servidor.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind, `openai` SDK, `@ricky0123/vad-web` (Silero VAD), Vitest + Testing Library.

> **Convenções (todas as tarefas):**
> - Comentários e mensagens de log em **português brasileiro** (regra do CLAUDE.md).
> - Type hints sempre; arquivos focados (uma responsabilidade).
> - Em TODO commit, anexar ao final da mensagem:
>   `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
> - Trabalhar dentro de `traduzAI/web/` salvo indicado. Rodar testes a partir de `web/`.

---

## Estrutura de arquivos (decomposição)

```
web/
├── app/
│   ├── page.tsx                       # tela única (client component)
│   ├── layout.tsx                     # (gerado pelo create-next-app)
│   └── api/
│       ├── setup-languages/route.ts   # POST: áudio → par de idiomas
│       └── translate/route.ts         # POST: áudio → tradução + voz
├── components/
│   ├── BigButton.tsx                  # botão central de estado
│   ├── StatusIndicator.tsx            # ouvindo/transcrevendo/...
│   └── ConversationLog.tsx            # balões da conversa
├── hooks/
│   ├── useMicVAD.ts                   # wrapper @ricky0123/vad-web
│   └── useConversation.ts             # orquestra reducer + fetch das rotas
├── lib/
│   ├── types.ts                       # tipos compartilhados
│   ├── routing.ts                     # resolveTarget (puro)
│   ├── prompt.ts                      # builders de prompt (puro)
│   ├── languages.ts                   # parse/validação do setup + tradução (puro)
│   ├── audio.ts                       # encodeWAV, playBase64 (browser)
│   ├── conversationMachine.ts         # reducer da máquina de estados (puro)
│   ├── openai.ts                      # wrappers do SDK OpenAI (server-only)
│   ├── setupPipeline.ts               # orquestra runSetup (server)
│   └── translatePipeline.ts           # orquestra runTranslate (server)
├── lib/__tests__/                     # testes Vitest
├── .env.example
├── vitest.config.ts
└── README.md
```

---

## Task 1: Scaffold do projeto + tooling de teste

**Files:**
- Create: `web/` (via create-next-app)
- Create: `web/vitest.config.ts`
- Create: `web/lib/__tests__/smoke.test.ts`
- Modify: `web/package.json` (scripts)

- [ ] **Step 1: Gerar o app Next.js**

A partir de `traduzAI/`:
```bash
npx create-next-app@latest web --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --yes
```
Expected: cria `web/` com App Router, TS e Tailwind.

- [ ] **Step 2: Instalar dependências de runtime e teste**

```bash
cd web
npm install openai @ricky0123/vad-web onnxruntime-web
npm install -D vitest @vitejs/plugin-react vite-tsconfig-paths jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 3: Criar `web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

- [ ] **Step 4: Adicionar scripts de teste em `web/package.json`**

No bloco `"scripts"`, adicionar:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Escrever teste smoke `web/lib/__tests__/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("ambiente de teste", () => {
  it("roda Vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Rodar o smoke test**

Run (em `web/`): `npm test`
Expected: PASS, 1 teste.

- [ ] **Step 7: Commit**

```bash
git add web/ -- ':!web/node_modules'
git commit -m "chore: scaffold web app Next.js + Vitest"
```

---

## Task 2: Tipos compartilhados

**Files:**
- Create: `web/lib/types.ts`

- [ ] **Step 1: Criar `web/lib/types.ts`**

```ts
/** Um idioma identificado por código ISO 639-1 e nome de exibição. */
export type Lang = { code: string; name: string };

/** Par de idiomas da sessão de conversa. */
export type LanguagePair = { langA: Lang; langB: Lang };

/** Um turno da conversa (fala original ou tradução). */
export type Turn = {
  role: "original" | "translation";
  lang: string; // código ISO
  text: string;
};

/** Resultado de uma tradução completa (texto + voz). */
export type TranslateResult = {
  sourceText: string;
  sourceLang: string;
  targetText: string;
  targetLang: string;
  audioBase64: string; // MP3 em base64
};
```

- [ ] **Step 2: Commit**

```bash
git add web/lib/types.ts
git commit -m "feat: tipos compartilhados do domínio"
```

---

## Task 3: Roteamento de idioma (função pura)

**Files:**
- Create: `web/lib/routing.ts`
- Test: `web/lib/__tests__/routing.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`web/lib/__tests__/routing.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolveTarget } from "@/lib/routing";
import type { LanguagePair } from "@/lib/types";

const par: LanguagePair = {
  langA: { code: "pt", name: "Português" },
  langB: { code: "en", name: "English" },
};

describe("resolveTarget", () => {
  it("origem A → alvo B", () => {
    expect(resolveTarget("pt", par)).toEqual(par.langB);
  });
  it("origem B → alvo A", () => {
    expect(resolveTarget("en", par)).toEqual(par.langA);
  });
  it("idioma fora do par → alvo B (padrão)", () => {
    expect(resolveTarget("fr", par)).toEqual(par.langB);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- routing`
Expected: FAIL ("resolveTarget is not a function" / módulo inexistente).

- [ ] **Step 3: Implementar `web/lib/routing.ts`**

```ts
import type { Lang, LanguagePair } from "@/lib/types";

/**
 * Decide o idioma alvo a partir do idioma detectado na fala.
 * Se o detectado for o idioma A, traduz para B, e vice-versa.
 * Idioma fora do par cai no padrão (B) — degradação graciosa.
 */
export function resolveTarget(detected: string, pair: LanguagePair): Lang {
  if (detected === pair.langA.code) return pair.langB;
  if (detected === pair.langB.code) return pair.langA;
  return pair.langB;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- routing`
Expected: PASS, 3 testes.

- [ ] **Step 5: Commit**

```bash
git add web/lib/routing.ts web/lib/__tests__/routing.test.ts
git commit -m "feat: função pura de roteamento de idioma"
```

---

## Task 4: Builders de prompt (função pura)

**Files:**
- Create: `web/lib/prompt.ts`
- Test: `web/lib/__tests__/prompt.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`web/lib/__tests__/prompt.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildSetupMessages, buildTranslationMessages } from "@/lib/prompt";
import type { LanguagePair, Turn } from "@/lib/types";

const par: LanguagePair = {
  langA: { code: "pt", name: "Português" },
  langB: { code: "en", name: "English" },
};

describe("buildSetupMessages", () => {
  it("inclui a transcrição e pede JSON", () => {
    const msgs = buildSetupMessages("português e inglês");
    const blob = JSON.stringify(msgs);
    expect(blob).toContain("português e inglês");
    expect(blob.toLowerCase()).toContain("json");
  });
});

describe("buildTranslationMessages", () => {
  it("inclui os dois idiomas, o histórico e a fala atual", () => {
    const history: Turn[] = [{ role: "original", lang: "pt", text: "Bom dia" }];
    const msgs = buildTranslationMessages({ text: "Tudo bem?", pair: par, history });
    const blob = JSON.stringify(msgs);
    expect(blob).toContain("Português");
    expect(blob).toContain("English");
    expect(blob).toContain("Bom dia");      // contexto
    expect(blob).toContain("Tudo bem?");    // fala atual
    expect(blob.toLowerCase()).toContain("json");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- prompt`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `web/lib/prompt.ts`**

```ts
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { LanguagePair, Turn } from "@/lib/types";

/**
 * Monta as mensagens para extrair os dois idiomas que o usuário falou.
 * O modelo deve devolver JSON com códigos ISO 639-1 e nomes.
 */
export function buildSetupMessages(transcript: string): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content:
        "Você configura uma sessão de tradução. O usuário falou os dois idiomas que vai usar. " +
        "Extraia exatamente dois idiomas distintos. Responda SOMENTE em JSON no formato " +
        '{"langA":{"code":"<ISO 639-1>","name":"<nome>"},"langB":{"code":"<ISO 639-1>","name":"<nome>"}}. ' +
        "Se não identificar dois idiomas, responda {\"error\":\"not_two_languages\"}.",
    },
    { role: "user", content: transcript },
  ];
}

/**
 * Monta as mensagens de tradução. O modelo detecta em qual dos dois
 * idiomas configurados está a fala e traduz para o outro, usando o
 * histórico como contexto. Devolve JSON {sourceLang, targetText}.
 */
export function buildTranslationMessages(input: {
  text: string;
  pair: LanguagePair;
  history: Turn[];
}): ChatCompletionMessageParam[] {
  const { text, pair, history } = input;
  const contexto = history
    .map((t) => `(${t.lang}) ${t.text}`)
    .join("\n");

  return [
    {
      role: "system",
      content:
        "Você é um intérprete simultâneo. Os dois idiomas da conversa são " +
        `${pair.langA.name} (${pair.langA.code}) e ${pair.langB.name} (${pair.langB.code}). ` +
        "A fala do usuário está em UM desses dois idiomas. Detecte qual e traduza para o OUTRO, " +
        "preservando tom, nomes próprios, termos do domínio e nível de formalidade. " +
        "Use o histórico apenas como contexto. " +
        'Responda SOMENTE em JSON {"sourceLang":"<código ISO do idioma da fala>","targetText":"<tradução>"}.',
    },
    {
      role: "user",
      content:
        (contexto ? `Histórico da conversa:\n${contexto}\n\n` : "") +
        `Fala a traduzir:\n${text}`,
    },
  ];
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- prompt`
Expected: PASS, 2 testes.

- [ ] **Step 5: Commit**

```bash
git add web/lib/prompt.ts web/lib/__tests__/prompt.test.ts
git commit -m "feat: builders de prompt de setup e tradução"
```

---

## Task 5: Parsing/validação das respostas do modelo (função pura)

**Files:**
- Create: `web/lib/languages.ts`
- Test: `web/lib/__tests__/languages.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`web/lib/__tests__/languages.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseLanguageSetup, parseTranslation } from "@/lib/languages";
import type { LanguagePair } from "@/lib/types";

const par: LanguagePair = {
  langA: { code: "pt", name: "Português" },
  langB: { code: "en", name: "English" },
};

describe("parseLanguageSetup", () => {
  it("aceita JSON com dois idiomas", () => {
    const raw = '{"langA":{"code":"pt","name":"Português"},"langB":{"code":"en","name":"English"}}';
    expect(parseLanguageSetup(raw)).toEqual(par);
  });
  it("lança quando o modelo sinaliza erro", () => {
    expect(() => parseLanguageSetup('{"error":"not_two_languages"}')).toThrow();
  });
  it("lança em JSON inválido", () => {
    expect(() => parseLanguageSetup("não é json")).toThrow();
  });
});

describe("parseTranslation", () => {
  it("aceita sourceLang válido e targetText", () => {
    const r = parseTranslation('{"sourceLang":"pt","targetText":"Good morning"}', par);
    expect(r).toEqual({ sourceLang: "pt", targetText: "Good morning" });
  });
  it("força sourceLang ao idioma A quando vem fora do par", () => {
    const r = parseTranslation('{"sourceLang":"fr","targetText":"x"}', par);
    expect(r.sourceLang).toBe("pt");
  });
  it("lança quando targetText está vazio", () => {
    expect(() => parseTranslation('{"sourceLang":"pt","targetText":""}', par)).toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- languages`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `web/lib/languages.ts`**

```ts
import type { LanguagePair } from "@/lib/types";

/** Converte a resposta JSON do setup em um par de idiomas validado. */
export function parseLanguageSetup(raw: string): LanguagePair {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error("Resposta de setup não é JSON válido.");
  }
  const o = obj as Record<string, any>;
  if (o?.error || !o?.langA?.code || !o?.langB?.code) {
    throw new Error("Não identifiquei dois idiomas. Peça para repetir.");
  }
  if (o.langA.code === o.langB.code) {
    throw new Error("Os dois idiomas precisam ser diferentes.");
  }
  return {
    langA: { code: String(o.langA.code), name: String(o.langA.name ?? o.langA.code) },
    langB: { code: String(o.langB.code), name: String(o.langB.name ?? o.langB.code) },
  };
}

/** Valida a resposta JSON da tradução; clampa sourceLang ao par. */
export function parseTranslation(
  raw: string,
  pair: LanguagePair,
): { sourceLang: string; targetText: string } {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error("Resposta de tradução não é JSON válido.");
  }
  const o = obj as Record<string, any>;
  const targetText = String(o?.targetText ?? "").trim();
  if (!targetText) {
    throw new Error("Tradução vazia.");
  }
  let sourceLang = String(o?.sourceLang ?? "");
  if (sourceLang !== pair.langA.code && sourceLang !== pair.langB.code) {
    // Fora do par: assume idioma A (alvo cairá em B).
    sourceLang = pair.langA.code;
  }
  return { sourceLang, targetText };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- languages`
Expected: PASS, 6 testes.

- [ ] **Step 5: Commit**

```bash
git add web/lib/languages.ts web/lib/__tests__/languages.test.ts
git commit -m "feat: parsing e validação das respostas do modelo"
```

---

## Task 6: Codificação WAV no browser (função pura)

**Files:**
- Create: `web/lib/audio.ts`
- Test: `web/lib/__tests__/audio.test.ts`

> Contexto: o VAD entrega `Float32Array` mono a 16 kHz. As rotas precisam de um arquivo de áudio; convertemos para WAV PCM 16-bit.

- [ ] **Step 1: Escrever o teste que falha**

`web/lib/__tests__/audio.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { encodeWAV } from "@/lib/audio";

describe("encodeWAV", () => {
  it("gera header RIFF/WAVE e tamanho correto", async () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const blob = encodeWAV(samples, 16000);
    expect(blob.type).toBe("audio/wav");
    const buf = await blob.arrayBuffer();
    // 44 bytes de header + 2 bytes por amostra
    expect(buf.byteLength).toBe(44 + samples.length * 2);
    const head = new TextDecoder().decode(buf.slice(0, 4));
    expect(head).toBe("RIFF");
    const fmt = new TextDecoder().decode(buf.slice(8, 12));
    expect(fmt).toBe("WAVE");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- audio`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `web/lib/audio.ts`**

```ts
/**
 * Converte amostras PCM float (-1..1) mono em um Blob WAV 16-bit.
 * Usado para enviar a fala capturada pelo VAD às rotas serverless.
 */
export function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // tamanho do bloco fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits por amostra
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** Toca um MP3 recebido em base64. Resolve quando o áudio termina. */
export function playBase64Audio(base64: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(`data:audio/mp3;base64,${base64}`);
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error("Falha ao tocar áudio."));
    void audio.play();
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- audio`
Expected: PASS, 1 teste.

- [ ] **Step 5: Commit**

```bash
git add web/lib/audio.ts web/lib/__tests__/audio.test.ts
git commit -m "feat: encodeWAV e playBase64Audio no browser"
```

---

## Task 7: Reducer da máquina de estados (função pura)

**Files:**
- Create: `web/lib/conversationMachine.ts`
- Test: `web/lib/__tests__/conversationMachine.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`web/lib/__tests__/conversationMachine.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { initialState, reducer } from "@/lib/conversationMachine";
import type { LanguagePair } from "@/lib/types";

const par: LanguagePair = {
  langA: { code: "pt", name: "Português" },
  langB: { code: "en", name: "English" },
};

describe("conversationMachine", () => {
  it("IDLE + BEGIN → SETUP", () => {
    const s = reducer(initialState, { type: "BEGIN" });
    expect(s.phase).toBe("SETUP");
  });
  it("SETUP + LANGUAGES_SET → ACTIVE com par", () => {
    let s = reducer(initialState, { type: "BEGIN" });
    s = reducer(s, { type: "LANGUAGES_SET", pair: par });
    expect(s.phase).toBe("ACTIVE");
    expect(s.pair).toEqual(par);
  });
  it("ADD_TURNS acumula turnos", () => {
    let s = reducer(initialState, { type: "BEGIN" });
    s = reducer(s, { type: "LANGUAGES_SET", pair: par });
    s = reducer(s, {
      type: "ADD_TURNS",
      turns: [
        { role: "original", lang: "pt", text: "Oi" },
        { role: "translation", lang: "en", text: "Hi" },
      ],
    });
    expect(s.turns).toHaveLength(2);
  });
  it("TOGGLE_MUTE inverte muted", () => {
    const s = reducer(initialState, { type: "TOGGLE_MUTE" });
    expect(s.muted).toBe(true);
  });
  it("RESET volta ao estado inicial", () => {
    let s = reducer(initialState, { type: "BEGIN" });
    s = reducer(s, { type: "RESET" });
    expect(s).toEqual(initialState);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- conversationMachine`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `web/lib/conversationMachine.ts`**

```ts
import type { LanguagePair, Turn } from "@/lib/types";

export type Phase = "IDLE" | "SETUP" | "ACTIVE" | "ERROR";

export type ConversationState = {
  phase: Phase;
  pair?: LanguagePair;
  turns: Turn[];
  status: string; // rótulo do indicador (ex.: "ouvindo")
  muted: boolean;
  error?: string;
};

export type Action =
  | { type: "BEGIN" }
  | { type: "LANGUAGES_SET"; pair: LanguagePair }
  | { type: "ADD_TURNS"; turns: Turn[] }
  | { type: "SET_STATUS"; status: string }
  | { type: "ERROR"; error: string }
  | { type: "TOGGLE_MUTE" }
  | { type: "RESET" };

export const initialState: ConversationState = {
  phase: "IDLE",
  turns: [],
  status: "",
  muted: false,
};

/** Reducer puro da sessão de conversa. */
export function reducer(state: ConversationState, action: Action): ConversationState {
  switch (action.type) {
    case "BEGIN":
      return { ...state, phase: "SETUP", status: "diga os dois idiomas" };
    case "LANGUAGES_SET":
      return { ...state, phase: "ACTIVE", pair: action.pair, status: "ouvindo", error: undefined };
    case "ADD_TURNS":
      return { ...state, turns: [...state.turns, ...action.turns] };
    case "SET_STATUS":
      return { ...state, status: action.status };
    case "ERROR":
      return { ...state, phase: "ERROR", error: action.error };
    case "TOGGLE_MUTE":
      return { ...state, muted: !state.muted };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- conversationMachine`
Expected: PASS, 5 testes.

- [ ] **Step 5: Commit**

```bash
git add web/lib/conversationMachine.ts web/lib/__tests__/conversationMachine.test.ts
git commit -m "feat: reducer da máquina de estados da conversa"
```

---

## Task 8: Wrappers do SDK OpenAI (server-only)

**Files:**
- Create: `web/lib/openai.ts`
- Test: `web/lib/__tests__/openai.test.ts`

- [ ] **Step 1: Escrever o teste que falha (mockando o SDK)**

`web/lib/__tests__/openai.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn();
vi.mock("openai", () => {
  return {
    default: class {
      audio = { transcriptions: { create } };
    },
  };
});

beforeEach(() => create.mockReset());

describe("transcribe", () => {
  it("chama o modelo de STT e devolve o texto", async () => {
    create.mockResolvedValue({ text: "olá mundo" });
    const { transcribe } = await import("@/lib/openai");
    const file = new File([new Uint8Array([1, 2, 3])], "fala.wav", { type: "audio/wav" });
    const texto = await transcribe(file);
    expect(texto).toBe("olá mundo");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4o-transcribe", file }),
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- openai`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `web/lib/openai.ts`**

```ts
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

// Cliente criado sob demanda (lazy): não exige a chave no momento do build.
let _client: OpenAI | null = null;
function getClient(): OpenAI {
  // Lê OPENAI_API_KEY do ambiente (server-side). Nunca expor no cliente.
  if (!_client) _client = new OpenAI();
  return _client;
}

/** Transcreve um arquivo de áudio para texto. */
export async function transcribe(file: File): Promise<string> {
  const r = await getClient().audio.transcriptions.create({
    file,
    model: "gpt-4o-transcribe",
  });
  return r.text;
}

/** Chat completion que devolve JSON (string crua). */
export async function chatJSON(
  messages: ChatCompletionMessageParam[],
  model = "gpt-4o-mini",
): Promise<string> {
  const c = await getClient().chat.completions.create({
    model,
    messages,
    response_format: { type: "json_object" },
    temperature: 0.2,
  });
  return c.choices[0]?.message?.content ?? "";
}

/** Sintetiza voz a partir de texto; devolve MP3 em base64. */
export async function synthesize(text: string): Promise<string> {
  const speech = await getClient().audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "alloy",
    input: text,
  });
  const buf = Buffer.from(await speech.arrayBuffer());
  return buf.toString("base64");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- openai`
Expected: PASS, 1 teste.

> `chatJSON` e `synthesize` são exercitados pelos testes de orquestração (Tasks 9 e 10, que mockam este módulo) e pela verificação manual (Task 14).

- [ ] **Step 5: Commit**

```bash
git add web/lib/openai.ts web/lib/__tests__/openai.test.ts
git commit -m "feat: wrappers do SDK OpenAI (STT, chat JSON, TTS)"
```

---

## Task 9: Pipeline de setup + rota `/api/setup-languages`

**Files:**
- Create: `web/lib/setupPipeline.ts`
- Create: `web/app/api/setup-languages/route.ts`
- Test: `web/lib/__tests__/setupPipeline.test.ts`

- [ ] **Step 1: Escrever o teste que falha (mockando lib/openai)**

`web/lib/__tests__/setupPipeline.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/openai", () => ({
  transcribe: vi.fn(),
  chatJSON: vi.fn(),
}));

import { transcribe, chatJSON } from "@/lib/openai";
import { runSetup } from "@/lib/setupPipeline";

beforeEach(() => {
  vi.mocked(transcribe).mockReset();
  vi.mocked(chatJSON).mockReset();
});

describe("runSetup", () => {
  it("transcreve e devolve o par de idiomas", async () => {
    vi.mocked(transcribe).mockResolvedValue("português e inglês");
    vi.mocked(chatJSON).mockResolvedValue(
      '{"langA":{"code":"pt","name":"Português"},"langB":{"code":"en","name":"English"}}',
    );
    const file = new File([new Uint8Array([1])], "f.wav", { type: "audio/wav" });
    const pair = await runSetup(file);
    expect(pair.langA.code).toBe("pt");
    expect(pair.langB.code).toBe("en");
    expect(transcribe).toHaveBeenCalledWith(file);
  });

  it("propaga erro quando o modelo não acha dois idiomas", async () => {
    vi.mocked(transcribe).mockResolvedValue("blá blá");
    vi.mocked(chatJSON).mockResolvedValue('{"error":"not_two_languages"}');
    const file = new File([new Uint8Array([1])], "f.wav", { type: "audio/wav" });
    await expect(runSetup(file)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- setupPipeline`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `web/lib/setupPipeline.ts`**

```ts
import { transcribe, chatJSON } from "@/lib/openai";
import { buildSetupMessages } from "@/lib/prompt";
import { parseLanguageSetup } from "@/lib/languages";
import type { LanguagePair } from "@/lib/types";

/** Recebe a fala com os dois idiomas e devolve o par configurado. */
export async function runSetup(audio: File): Promise<LanguagePair> {
  const transcript = await transcribe(audio);
  const raw = await chatJSON(buildSetupMessages(transcript));
  return parseLanguageSetup(raw);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- setupPipeline`
Expected: PASS, 2 testes.

- [ ] **Step 5: Criar a rota `web/app/api/setup-languages/route.ts`**

```ts
import { NextResponse } from "next/server";
import { runSetup } from "@/lib/setupPipeline";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "Áudio ausente." }, { status: 400 });
    }
    const pair = await runSetup(audio);
    return NextResponse.json(pair);
  } catch (e) {
    console.error("[setup-languages] erro:", e);
    // 422: cliente deve pedir para repetir os idiomas.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha no setup." },
      { status: 422 },
    );
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add web/lib/setupPipeline.ts web/lib/__tests__/setupPipeline.test.ts web/app/api/setup-languages/route.ts
git commit -m "feat: pipeline e rota de configuração de idiomas por voz"
```

---

## Task 10: Pipeline de tradução + rota `/api/translate`

**Files:**
- Create: `web/lib/translatePipeline.ts`
- Create: `web/app/api/translate/route.ts`
- Test: `web/lib/__tests__/translatePipeline.test.ts`

- [ ] **Step 1: Escrever o teste que falha (mockando lib/openai)**

`web/lib/__tests__/translatePipeline.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/openai", () => ({
  transcribe: vi.fn(),
  chatJSON: vi.fn(),
  synthesize: vi.fn(),
}));

import { transcribe, chatJSON, synthesize } from "@/lib/openai";
import { runTranslate } from "@/lib/translatePipeline";
import type { LanguagePair } from "@/lib/types";

const par: LanguagePair = {
  langA: { code: "pt", name: "Português" },
  langB: { code: "en", name: "English" },
};

beforeEach(() => {
  vi.mocked(transcribe).mockReset();
  vi.mocked(chatJSON).mockReset();
  vi.mocked(synthesize).mockReset();
});

describe("runTranslate", () => {
  it("transcreve, traduz com roteamento e sintetiza", async () => {
    vi.mocked(transcribe).mockResolvedValue("Bom dia");
    vi.mocked(chatJSON).mockResolvedValue('{"sourceLang":"pt","targetText":"Good morning"}');
    vi.mocked(synthesize).mockResolvedValue("QUJD"); // base64 fake

    const file = new File([new Uint8Array([1])], "f.wav", { type: "audio/wav" });
    const r = await runTranslate({ audio: file, pair: par, history: [] });

    expect(r.sourceText).toBe("Bom dia");
    expect(r.sourceLang).toBe("pt");
    expect(r.targetLang).toBe("en"); // pt → en
    expect(r.targetText).toBe("Good morning");
    expect(r.audioBase64).toBe("QUJD");
    expect(synthesize).toHaveBeenCalledWith("Good morning");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- translatePipeline`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `web/lib/translatePipeline.ts`**

```ts
import { transcribe, chatJSON, synthesize } from "@/lib/openai";
import { buildTranslationMessages } from "@/lib/prompt";
import { parseTranslation } from "@/lib/languages";
import { resolveTarget } from "@/lib/routing";
import type { LanguagePair, Turn, TranslateResult } from "@/lib/types";

/** Pipeline completo de uma fala: STT → tradução com contexto → TTS. */
export async function runTranslate(input: {
  audio: File;
  pair: LanguagePair;
  history: Turn[];
}): Promise<TranslateResult> {
  const { audio, pair, history } = input;

  const sourceText = await transcribe(audio);
  const raw = await chatJSON(buildTranslationMessages({ text: sourceText, pair, history }));
  const { sourceLang, targetText } = parseTranslation(raw, pair);
  const targetLang = resolveTarget(sourceLang, pair).code;
  const audioBase64 = await synthesize(targetText);

  return { sourceText, sourceLang, targetText, targetLang, audioBase64 };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- translatePipeline`
Expected: PASS, 1 teste.

- [ ] **Step 5: Criar a rota `web/app/api/translate/route.ts`**

```ts
import { NextResponse } from "next/server";
import { runTranslate } from "@/lib/translatePipeline";
import type { LanguagePair, Turn } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const audio = form.get("audio");
    const pairRaw = form.get("pair");
    const historyRaw = form.get("history");

    if (!(audio instanceof File) || typeof pairRaw !== "string") {
      return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
    }

    const pair = JSON.parse(pairRaw) as LanguagePair;
    const history = (typeof historyRaw === "string" ? JSON.parse(historyRaw) : []) as Turn[];

    const result = await runTranslate({ audio, pair, history });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[translate] erro:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha na tradução." },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add web/lib/translatePipeline.ts web/lib/__tests__/translatePipeline.test.ts web/app/api/translate/route.ts
git commit -m "feat: pipeline e rota de tradução com contexto"
```

---

## Task 11: Hook `useMicVAD`

**Files:**
- Create: `web/hooks/useMicVAD.ts`

> Verificação manual (Task 14) — o VAD depende de microfone real e não é testado em unidade. Mantemos o hook fino.

- [ ] **Step 1: Implementar `web/hooks/useMicVAD.ts`**

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Assets do VAD/ONNX servidos via CDN (evita copiar wasm/modelo para /public no MVP).
const VAD_ASSET_PATH = "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@latest/dist/";
const ORT_WASM_PATH = "https://cdn.jsdelivr.net/npm/onnxruntime-web@latest/dist/";

/**
 * Encapsula @ricky0123/vad-web. Chama onSpeechEnd com as amostras
 * (Float32Array mono 16 kHz) sempre que o usuário termina uma fala.
 */
export function useMicVAD(onSpeechEnd: (audio: Float32Array) => void) {
  const [listening, setListening] = useState(false);
  // Mantém referência mutável ao callback sem recriar o VAD.
  const cbRef = useRef(onSpeechEnd);
  cbRef.current = onSpeechEnd;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vadRef = useRef<any>(null);

  const start = useCallback(async () => {
    if (vadRef.current) {
      await vadRef.current.start();
      setListening(true);
      return;
    }
    // Import dinâmico: a lib só funciona no browser.
    const { MicVAD } = await import("@ricky0123/vad-web");
    vadRef.current = await MicVAD.new({
      baseAssetPath: VAD_ASSET_PATH,
      onnxWASMBasePath: ORT_WASM_PATH,
      onSpeechEnd: (audio: Float32Array) => cbRef.current(audio),
    });
    await vadRef.current.start();
    setListening(true);
  }, []);

  const stop = useCallback(() => {
    vadRef.current?.pause();
    setListening(false);
  }, []);

  useEffect(() => {
    return () => vadRef.current?.destroy?.();
  }, []);

  return { listening, start, stop };
}
```

- [ ] **Step 2: Verificar build de tipos**

Run (em `web/`): `npx tsc --noEmit`
Expected: sem erros de tipo.

- [ ] **Step 3: Commit**

```bash
git add web/hooks/useMicVAD.ts
git commit -m "feat: hook useMicVAD com @ricky0123/vad-web"
```

---

## Task 12: Hook `useConversation`

**Files:**
- Create: `web/hooks/useConversation.ts`

> Orquestra reducer (testado na Task 7) + chamadas às rotas + VAD. Verificação manual na Task 14.

- [ ] **Step 1: Implementar `web/hooks/useConversation.ts`**

```ts
"use client";

import { useCallback, useReducer, useRef } from "react";
import { initialState, reducer } from "@/lib/conversationMachine";
import { encodeWAV, playBase64Audio } from "@/lib/audio";
import { useMicVAD } from "@/hooks/useMicVAD";
import type { LanguagePair, TranslateResult, Turn } from "@/lib/types";

const SAMPLE_RATE = 16000;
const HISTORY_WINDOW = 6; // turnos enviados como contexto

export function useConversation() {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Espelhos em ref para uso dentro do callback do VAD (sem stale closure).
  const phaseRef = useRef(state.phase);
  phaseRef.current = state.phase;
  const pairRef = useRef<LanguagePair | undefined>(state.pair);
  pairRef.current = state.pair;
  const turnsRef = useRef<Turn[]>(state.turns);
  turnsRef.current = state.turns;
  const mutedRef = useRef(state.muted);
  mutedRef.current = state.muted;

  const handleSpeech = useCallback(async (audio: Float32Array) => {
    const wav = encodeWAV(audio, SAMPLE_RATE);

    // Fase SETUP: a primeira fala define os idiomas.
    if (phaseRef.current === "SETUP") {
      try {
        dispatch({ type: "SET_STATUS", status: "configurando idiomas…" });
        const fd = new FormData();
        fd.append("audio", wav, "setup.wav");
        const res = await fetch("/api/setup-languages", { method: "POST", body: fd });
        if (!res.ok) throw new Error("Não entendi os idiomas, repita.");
        const pair = (await res.json()) as LanguagePair;
        dispatch({ type: "LANGUAGES_SET", pair });
      } catch (e) {
        dispatch({ type: "SET_STATUS", status: e instanceof Error ? e.message : "erro no setup" });
      }
      return;
    }

    // Fase ACTIVE: traduz a fala.
    if (phaseRef.current === "ACTIVE" && pairRef.current) {
      try {
        dispatch({ type: "SET_STATUS", status: "traduzindo…" });
        const fd = new FormData();
        fd.append("audio", wav, "fala.wav");
        fd.append("pair", JSON.stringify(pairRef.current));
        fd.append("history", JSON.stringify(turnsRef.current.slice(-HISTORY_WINDOW)));
        const res = await fetch("/api/translate", { method: "POST", body: fd });
        if (!res.ok) throw new Error("Falha na tradução.");
        const r = (await res.json()) as TranslateResult;

        dispatch({
          type: "ADD_TURNS",
          turns: [
            { role: "original", lang: r.sourceLang, text: r.sourceText },
            { role: "translation", lang: r.targetLang, text: r.targetText },
          ],
        });
        dispatch({ type: "SET_STATUS", status: "ouvindo" });
        if (!mutedRef.current) {
          dispatch({ type: "SET_STATUS", status: "falando…" });
          await playBase64Audio(r.audioBase64);
          dispatch({ type: "SET_STATUS", status: "ouvindo" });
        }
      } catch (e) {
        dispatch({ type: "SET_STATUS", status: e instanceof Error ? e.message : "erro" });
      }
    }
  }, []);

  const { listening, start, stop } = useMicVAD(handleSpeech);

  const begin = useCallback(async () => {
    dispatch({ type: "BEGIN" });
    try {
      await start();
    } catch {
      // Permissão de microfone negada ou VAD indisponível.
      dispatch({
        type: "ERROR",
        error: "Não consegui acessar o microfone. Permita o acesso e tente de novo.",
      });
    }
  }, [start]);

  const reset = useCallback(() => {
    stop();
    dispatch({ type: "RESET" });
  }, [stop]);

  const toggleMute = useCallback(() => dispatch({ type: "TOGGLE_MUTE" }), []);

  return { state, listening, begin, reset, toggleMute };
}
```

- [ ] **Step 2: Verificar build de tipos**

Run (em `web/`): `npx tsc --noEmit`
Expected: sem erros de tipo.

- [ ] **Step 3: Commit**

```bash
git add web/hooks/useConversation.ts
git commit -m "feat: hook useConversation (reducer + rotas + VAD)"
```

---

## Task 13: UI — componentes e tela única

**Files:**
- Create: `web/components/StatusIndicator.tsx`
- Create: `web/components/BigButton.tsx`
- Create: `web/components/ConversationLog.tsx`
- Modify: `web/app/page.tsx`

- [ ] **Step 1: Criar `web/components/StatusIndicator.tsx`**

```tsx
type Props = { status: string; pairLabel?: string };

/** Mostra o par de idiomas e o estado atual (ouvindo/traduzindo/…). */
export function StatusIndicator({ status, pairLabel }: Props) {
  return (
    <div className="text-center">
      {pairLabel && <div className="text-sm text-gray-400">{pairLabel}</div>}
      <div className="text-lg font-medium text-gray-700">{status || "—"}</div>
    </div>
  );
}
```

- [ ] **Step 2: Criar `web/components/BigButton.tsx`**

```tsx
type Props = {
  active: boolean;
  onStart: () => void;
};

/** Botão central grande: inicia a sessão. */
export function BigButton({ active, onStart }: Props) {
  return (
    <button
      onClick={onStart}
      disabled={active}
      className={`h-40 w-40 rounded-full text-white text-xl font-semibold shadow-lg transition
        ${active ? "bg-green-500 animate-pulse" : "bg-blue-600 active:scale-95"}`}
    >
      {active ? "ouvindo" : "iniciar"}
    </button>
  );
}
```

- [ ] **Step 3: Criar `web/components/ConversationLog.tsx`**

```tsx
import type { Turn } from "@/lib/types";

/** Lista os turnos da conversa em balões. */
export function ConversationLog({ turns }: { turns: Turn[] }) {
  return (
    <div className="flex flex-col gap-2 w-full max-w-md">
      {turns.map((t, i) => (
        <div
          key={i}
          className={`rounded-2xl px-4 py-2 max-w-[85%] ${
            t.role === "original"
              ? "self-start bg-gray-200 text-gray-800"
              : "self-end bg-blue-600 text-white"
          }`}
        >
          <span className="block text-[10px] uppercase opacity-60">{t.lang}</span>
          {t.text}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Substituir `web/app/page.tsx`**

```tsx
"use client";

import { useConversation } from "@/hooks/useConversation";
import { StatusIndicator } from "@/components/StatusIndicator";
import { BigButton } from "@/components/BigButton";
import { ConversationLog } from "@/components/ConversationLog";

export default function Home() {
  const { state, listening, begin, toggleMute } = useConversation();
  const pairLabel = state.pair
    ? `${state.pair.langA.code.toUpperCase()} ⇄ ${state.pair.langB.code.toUpperCase()}`
    : undefined;

  return (
    <main className="flex min-h-screen flex-col items-center justify-between gap-6 p-6">
      <header className="pt-8">
        <h1 className="text-2xl font-bold text-center">TraduzAI</h1>
        <StatusIndicator status={state.status} pairLabel={pairLabel} />
      </header>

      <ConversationLog turns={state.turns} />

      <div className="flex flex-col items-center gap-4 pb-10">
        <BigButton active={listening} onStart={begin} />
        {state.phase === "ACTIVE" && (
          <button onClick={toggleMute} className="text-sm text-gray-500 underline">
            {state.muted ? "ativar voz" : "silenciar voz"}
          </button>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Verificar build**

Run (em `web/`): `npm run build`
Expected: build conclui sem erros.

- [ ] **Step 6: Commit**

```bash
git add web/components/ web/app/page.tsx
git commit -m "feat: UI single-screen (botão, status, balões da conversa)"
```

---

## Task 14: Configuração de ambiente + verificação manual local

**Files:**
- Create: `web/.env.example`
- Create: `web/README.md`

- [ ] **Step 1: Criar `web/.env.example`**

```env
# Chave da OpenAI (server-side; NUNCA commitar a real)
OPENAI_API_KEY=sk-...
```

- [ ] **Step 2: Criar `web/.env.local` com a chave real (não commitado)**

```bash
cd web
printf 'OPENAI_API_KEY=%s\n' "SUA_CHAVE_AQUI" > .env.local
```
> `.env.local` já é ignorado pelo `.gitignore` da raiz.

- [ ] **Step 3: Rodar todos os testes**

Run (em `web/`): `npm test`
Expected: todas as suítes PASS.

- [ ] **Step 4: Subir o dev server e testar no celular**

```bash
cd web
npm run dev -- -H 0.0.0.0
```
Verificação manual (celular na mesma rede, abrir `http://<IP-do-PC>:3000`):
- [ ] Permitir microfone.
- [ ] Tocar "iniciar" → status "diga os dois idiomas" → falar "português e inglês" → aparece `PT ⇄ EN`.
- [ ] Falar em português → aparece balão original + tradução em inglês e toca a voz.
- [ ] Falar em inglês → traduz para português.
- [ ] Testar o toggle de voz.

> Microfone no browser exige HTTPS ou localhost. Para testar no celular por IP (HTTP), o teste E2E real fica para o deploy na Vercel (Step seguinte / Task 15), que serve HTTPS.

- [ ] **Step 5: Criar `web/README.md`**

```markdown
# TraduzAI Web

Tradução simultânea por voz no navegador. Pipeline OpenAI (STT → GPT com contexto → TTS).

## Rodar localmente
```bash
npm install
cp .env.example .env.local   # preencher OPENAI_API_KEY
npm run dev
```

## Testes
```bash
npm test
```

## Deploy
Vercel. Definir a env `OPENAI_API_KEY` no projeto. HTTPS automático (necessário para o microfone).
```

- [ ] **Step 6: Commit**

```bash
git add web/.env.example web/README.md
git commit -m "docs: env de exemplo e README do app web"
```

---

## Task 15: Deploy na Vercel + E2E HTTPS

**Files:** nenhum (operação de deploy)

- [ ] **Step 1: Subir o repositório para o GitHub** (se ainda não estiver)

```bash
gh repo create traduzAI --private --source=. --remote=origin --push
```
> Confirmar com o usuário antes (operação que publica o código).

- [ ] **Step 2: Conectar à Vercel e configurar root**

- Importar o repo na Vercel.
- Definir **Root Directory** = `web`.
- Adicionar env var `OPENAI_API_KEY`.

- [ ] **Step 3: Deploy e E2E no celular (HTTPS)**

Abrir a URL `*.vercel.app` no celular e repetir o checklist manual da Task 14, agora com microfone funcionando (HTTPS).
- [ ] Latência por fala ≤ ~3s.
- [ ] Tradução respeita o contexto (testar pronome/termo que dependa de fala anterior).

- [ ] **Step 4: Commit final / tag (opcional)**

```bash
git tag mvp-web-v0.1
```

---

## Notas finais

- **Latência:** se passar de 3s, primeiro suspeito é o TTS; avaliar `tts-1` ou streaming (Fase 2).
- **Detecção de idioma:** fica a cargo do GPT no passo de tradução (mais robusto que depender do STT). `resolveTarget` só mapeia o código detectado para o alvo.
- **Privacidade:** nenhum áudio é persistido — processado em memória e descartado a cada requisição.
- **Fase 2 (fora deste plano):** OpenAI Realtime API (speech-to-speech ~1s), streaming de TTS, PWA instalável.
