# Web Differentiators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Endurecer o app web TraduzAI e ampliar a diferenciação vs Google Tradutor com glossário consistente, voz por falante, recap e robustez.

**Architecture:** Lógica pura em `lib/` (testável isolada com vitest), orquestrada por hooks React e exposta por rotas serverless Next.js. Stack OpenAI-only. Três fases independentes: robustez → diferenciadores → wow/persistência.

**Tech Stack:** Next.js 16, React 19, TypeScript, OpenAI SDK, `@ricky0123/vad-web`, vitest.

**Working directory:** todos os caminhos são relativos a `web/`. Rode os comandos a partir de `web/`.

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `hooks/useMicVAD.ts` | Modificar | Pin de versão dos assets; pauseMic/resumeMic sem mexer no `listening` |
| `lib/playback.ts` | Criar | Sequência echo-guard (pause→play→resume) — pura, testável |
| `lib/guard.ts` | Criar | `createBusyGate()` — guarda de concorrência |
| `lib/types.ts` | Modificar | `GlossaryEntry`; `glossary?` em `TranslateResult` |
| `lib/glossary.ts` | Criar | `mergeGlossary`, `formatGlossary` |
| `lib/voice.ts` | Criar | `voiceFor(lang, pair)` → preset OpenAI |
| `lib/prompt.ts` | Modificar | Glossário no prompt + extração; rótulos de idioma |
| `lib/languages.ts` | Modificar | `parseTranslation` lê `glossary` (degradação graciosa) |
| `lib/openai.ts` | Modificar | `synthesize(text, voice)` |
| `lib/translatePipeline.ts` | Modificar | Passa glossário/voz; devolve glossário |
| `lib/recap.ts` | Criar | `buildRecapMessages` |
| `lib/recapPipeline.ts` | Criar | `runRecap` |
| `lib/session.ts` | Criar | `loadSession`/`saveSession` (localStorage) |
| `lib/conversationMachine.ts` | Modificar | `glossary` no estado; ações `SET_GLOSSARY`, `HYDRATE` |
| `hooks/useConversation.ts` | Modificar | echo-guard, busy-gate, glossaryRef, recap, reidratação |
| `app/api/translate/route.ts` | Modificar | Lê campo `glossary` |
| `app/api/recap/route.ts` | Criar | Rota do resumo |
| `app/page.tsx` | Modificar | Botão/painel de recap |
| `components/RecapPanel.tsx` | Criar | Painel do resumo com copiar/compartilhar |

Cada `lib/*` é pura e testada isolada. Hooks/rotas/UI são wiring fino sobre essas unidades.

---

## FASE 1 — Robustez

### Task 1: Pin de versão dos assets VAD/ORT

**Files:**
- Modify: `hooks/useMicVAD.ts`
- Test: `hooks/__tests__/useMicVAD.assets.test.ts` (criar)

- [ ] **Step 1: Write the failing test**

Criar `hooks/__tests__/useMicVAD.assets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { VAD_ASSET_PATH, ORT_WASM_PATH } from "@/hooks/useMicVAD";

describe("paths dos assets do VAD", () => {
  it("apontam para versões fixas, não @latest", () => {
    expect(VAD_ASSET_PATH).not.toContain("@latest");
    expect(ORT_WASM_PATH).not.toContain("@latest");
    expect(VAD_ASSET_PATH).toContain("@ricky0123/vad-web@0.0.30");
    expect(ORT_WASM_PATH).toContain("onnxruntime-web@1.26.0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- useMicVAD.assets`
Expected: FAIL — `VAD_ASSET_PATH` não é exportado / contém `@latest`.

- [ ] **Step 3: Edit `hooks/useMicVAD.ts`**

Trocar as duas constantes (atualmente não exportadas, com `@latest`) por versões fixas exportadas:

```ts
// Assets do VAD/ONNX servidos via CDN, com versão fixada (reprodutível, cold load previsível).
export const VAD_ASSET_PATH =
  "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/";
export const ORT_WASM_PATH =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- useMicVAD.assets`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add hooks/useMicVAD.ts hooks/__tests__/useMicVAD.assets.test.ts
git commit -m "fix(web): fixa versão dos assets VAD/ORT (sem @latest)"
```

---

### Task 2: Guarda de concorrência (`createBusyGate`)

**Files:**
- Create: `lib/guard.ts`
- Test: `lib/__tests__/guard.test.ts`

- [ ] **Step 1: Write the failing test**

Criar `lib/__tests__/guard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createBusyGate } from "@/lib/guard";

describe("createBusyGate", () => {
  it("primeira entrada passa, segunda é bloqueada até release", () => {
    const gate = createBusyGate();
    expect(gate.tryEnter()).toBe(true);
    expect(gate.tryEnter()).toBe(false);
    gate.release();
    expect(gate.tryEnter()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- guard`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Create `lib/guard.ts`**

```ts
/**
 * Porta de exclusão simples: garante que só um pipeline rode por vez.
 * Falas que chegam enquanto há processamento em curso são descartadas
 * (fala simultânea não é o caso de uso do MVP).
 */
export function createBusyGate() {
  let busy = false;
  return {
    /** Tenta entrar. Retorna false se já houver processamento ativo. */
    tryEnter(): boolean {
      if (busy) return false;
      busy = true;
      return true;
    },
    /** Libera a porta para a próxima fala. */
    release(): void {
      busy = false;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- guard`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/guard.ts lib/__tests__/guard.test.ts
git commit -m "feat(web): guarda de concorrência para o pipeline"
```

---

### Task 3: Echo-guard de playback (`playWithVadGuard`)

**Files:**
- Create: `lib/playback.ts`
- Test: `lib/__tests__/playback.test.ts`

- [ ] **Step 1: Write the failing test**

Criar `lib/__tests__/playback.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { playWithVadGuard } from "@/lib/playback";

describe("playWithVadGuard", () => {
  it("pausa o mic, toca e retoma — nessa ordem", async () => {
    const calls: string[] = [];
    await playWithVadGuard({
      audioBase64: "QUJD",
      muted: false,
      play: async () => { calls.push("play"); },
      pauseMic: () => { calls.push("pause"); },
      resumeMic: () => { calls.push("resume"); },
    });
    expect(calls).toEqual(["pause", "play", "resume"]);
  });

  it("retoma o mic mesmo se o playback falhar", async () => {
    const calls: string[] = [];
    await playWithVadGuard({
      audioBase64: "QUJD",
      muted: false,
      play: async () => { calls.push("play"); throw new Error("falha"); },
      pauseMic: () => { calls.push("pause"); },
      resumeMic: () => { calls.push("resume"); },
    });
    expect(calls).toEqual(["pause", "play", "resume"]);
  });

  it("não toca nem mexe no mic quando muted", async () => {
    const play = vi.fn();
    const pauseMic = vi.fn();
    await playWithVadGuard({
      audioBase64: "QUJD", muted: true, play, pauseMic, resumeMic: vi.fn(),
    });
    expect(play).not.toHaveBeenCalled();
    expect(pauseMic).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- playback`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Create `lib/playback.ts`**

```ts
/**
 * Toca o áudio traduzido com guarda de eco: pausa o microfone (VAD)
 * durante o playback e o retoma depois, evitando que o app traduza a
 * própria fala sintetizada. O retomar acontece sempre (finally), mesmo
 * se o playback falhar, para não deixar o microfone morto.
 */
export async function playWithVadGuard(opts: {
  audioBase64: string;
  muted: boolean;
  play: (base64: string) => Promise<void>;
  pauseMic: () => void;
  resumeMic: () => void | Promise<void>;
}): Promise<void> {
  if (opts.muted) return;
  opts.pauseMic();
  try {
    await opts.play(opts.audioBase64);
  } catch {
    // Erro de playback é silencioso aqui; o importante é retomar o mic.
  } finally {
    await opts.resumeMic();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- playback`
Expected: PASS (os 3 casos)

- [ ] **Step 5: Commit**

```bash
git add lib/playback.ts lib/__tests__/playback.test.ts
git commit -m "feat(web): echo-guard no playback (pausa VAD enquanto fala)"
```

---

### Task 4: Mic pause/resume sem alterar `listening` no useMicVAD

**Files:**
- Modify: `hooks/useMicVAD.ts`

Nota: hook puramente de glue (proxy ao MicVAD); sem teste unitário — a sequência já é coberta por `playWithVadGuard`. Verificação é manual no Task 6.

- [ ] **Step 1: Edit `hooks/useMicVAD.ts`**

Adicionar dois métodos que pausam/retomam o VAD subjacente **sem** mexer no estado `listening` (para a UI não piscar "pausado" durante a fala). Inserir antes do `return` do hook:

```ts
  // Pausa/retoma o VAD para o echo-guard, sem alterar `listening`
  // (a UI deve continuar mostrando "ouvindo" durante a fala traduzida).
  const pauseMic = useCallback(() => {
    vadRef.current?.pause();
  }, []);

  const resumeMic = useCallback(async () => {
    await vadRef.current?.start();
  }, []);
```

E estender o objeto retornado:

```ts
  return { listening, start, stop, pauseMic, resumeMic };
```

- [ ] **Step 2: Verify build/types**

Run: `npm test -- useMicVAD.assets`
Expected: PASS (sem regressão; confirma que o módulo compila).

- [ ] **Step 3: Commit**

```bash
git add hooks/useMicVAD.ts
git commit -m "feat(web): pauseMic/resumeMic no useMicVAD para echo-guard"
```

---

### Task 5: Estado de glossário no reducer (prepara Fase 2/3)

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/conversationMachine.ts`
- Test: `lib/__tests__/conversationMachine.test.ts` (estender)

- [ ] **Step 1: Write the failing test**

Acrescentar em `lib/__tests__/conversationMachine.test.ts`:

```ts
import { reducer, initialState } from "@/lib/conversationMachine";

describe("glossário e hidratação", () => {
  it("SET_GLOSSARY substitui o glossário", () => {
    const s = reducer(initialState, {
      type: "SET_GLOSSARY",
      glossary: [{ term: "João", translations: { pt: "João", en: "John" } }],
    });
    expect(s.glossary).toHaveLength(1);
    expect(s.glossary[0].term).toBe("João");
  });

  it("HYDRATE restaura par, turnos e glossário em ACTIVE", () => {
    const s = reducer(initialState, {
      type: "HYDRATE",
      pair: { langA: { code: "pt", name: "Português" }, langB: { code: "en", name: "English" } },
      turns: [{ role: "original", lang: "pt", text: "oi" }],
      glossary: [],
    });
    expect(s.phase).toBe("ACTIVE");
    expect(s.turns).toHaveLength(1);
    expect(s.status).toBe("ouvindo");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- conversationMachine`
Expected: FAIL — `glossary` não existe no estado; ações desconhecidas.

- [ ] **Step 3: Edit `lib/types.ts`**

Adicionar o tipo e estender `TranslateResult`:

```ts
/** Termo do glossário com traduções por código de idioma. */
export type GlossaryEntry = { term: string; translations: Record<string, string> };
```

E no `TranslateResult`, adicionar o campo opcional (mantendo os existentes):

```ts
export type TranslateResult = {
  sourceText: string;
  sourceLang: string;
  targetText: string;
  targetLang: string;
  audioBase64: string; // MP3 em base64
  glossary?: GlossaryEntry[]; // termos novos/canônicos desta fala
};
```

- [ ] **Step 4: Edit `lib/conversationMachine.ts`**

Importar o tipo e estender estado/ações/reducer. Topo:

```ts
import type { LanguagePair, Turn, GlossaryEntry } from "@/lib/types";
```

No `ConversationState`, adicionar campo:

```ts
  glossary: GlossaryEntry[];
```

No `initialState`, adicionar:

```ts
  glossary: [],
```

No tipo `Action`, adicionar:

```ts
  | { type: "SET_GLOSSARY"; glossary: GlossaryEntry[] }
  | { type: "HYDRATE"; pair: LanguagePair; turns: Turn[]; glossary: GlossaryEntry[] }
```

No `reducer`, adicionar os casos (antes do `default`):

```ts
    case "SET_GLOSSARY":
      return { ...state, glossary: action.glossary };
    case "HYDRATE":
      return {
        ...state,
        phase: "ACTIVE",
        pair: action.pair,
        turns: action.turns,
        glossary: action.glossary,
        status: "ouvindo",
      };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- conversationMachine`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/conversationMachine.ts lib/__tests__/conversationMachine.test.ts
git commit -m "feat(web): glossário e HYDRATE no estado da conversa"
```

---

### Task 6: Integrar guards no useConversation

**Files:**
- Modify: `hooks/useConversation.ts`

Nota: orquestração (sem teste unitário, segue o padrão atual do hook). Lógica testável já isolada em `guard.ts` e `playback.ts`.

- [ ] **Step 1: Edit `hooks/useConversation.ts`**

Importar as novas peças no topo:

```ts
import { createBusyGate } from "@/lib/guard";
import { playWithVadGuard } from "@/lib/playback";
```

Pegar os novos métodos do VAD:

```ts
  const { listening, start, stop, pauseMic, resumeMic } = useMicVAD(handleSpeech);
```

Criar a porta de concorrência (ref estável) dentro do `useConversation`, junto dos outros refs:

```ts
  const gateRef = useRef(createBusyGate());
```

No `handleSpeech`, envolver TODO o corpo ACTIVE com a porta. Substituir o bloco `if (phaseRef.current === "ACTIVE" && pairRef.current) { ... }` por:

```ts
    if (phaseRef.current === "ACTIVE" && pairRef.current) {
      if (!gateRef.current.tryEnter()) return; // já há tradução em curso → descarta
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
        dispatch({ type: "SET_STATUS", status: mutedRef.current ? "ouvindo" : "falando…" });
        await playWithVadGuard({
          audioBase64: r.audioBase64,
          muted: mutedRef.current,
          play: playBase64Audio,
          pauseMic,
          resumeMic,
        });
        dispatch({ type: "SET_STATUS", status: "ouvindo" });
      } catch (e) {
        dispatch({ type: "SET_STATUS", status: e instanceof Error ? e.message : "erro" });
      } finally {
        gateRef.current.release();
      }
    }
```

Garantir que `pauseMic`/`resumeMic` estão nas dependências do `useCallback` do `handleSpeech` (adicionar ao array de deps).

- [ ] **Step 2: Run full suite (sem regressão)**

Run: `npm test`
Expected: PASS (todos)

- [ ] **Step 3: Manual smoke (echo-guard)**

Run: `npm run dev`, abrir http://localhost:3000, iniciar sessão, falar, confirmar que o app NÃO traduz a própria voz traduzida (sem loop) e o botão continua "pausar" durante a fala.

- [ ] **Step 4: Commit**

```bash
git add hooks/useConversation.ts
git commit -m "feat(web): echo-guard e guarda de concorrência no pipeline"
```

---

## FASE 2 — Diferenciadores

### Task 7: Glossário puro (`mergeGlossary`, `formatGlossary`)

**Files:**
- Create: `lib/glossary.ts`
- Test: `lib/__tests__/glossary.test.ts`

- [ ] **Step 1: Write the failing test**

Criar `lib/__tests__/glossary.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mergeGlossary, formatGlossary } from "@/lib/glossary";
import type { LanguagePair, GlossaryEntry } from "@/lib/types";

const par: LanguagePair = {
  langA: { code: "pt", name: "Português" },
  langB: { code: "en", name: "English" },
};

describe("mergeGlossary", () => {
  it("adiciona termos novos", () => {
    const prev: GlossaryEntry[] = [{ term: "João", translations: { pt: "João", en: "John" } }];
    const next: GlossaryEntry[] = [{ term: "Maria", translations: { pt: "Maria", en: "Mary" } }];
    const out = mergeGlossary(prev, next);
    expect(out).toHaveLength(2);
  });

  it("funde traduções do mesmo termo (case-insensitive) sem duplicar", () => {
    const prev: GlossaryEntry[] = [{ term: "João", translations: { pt: "João" } }];
    const next: GlossaryEntry[] = [{ term: "joão", translations: { en: "John" } }];
    const out = mergeGlossary(prev, next);
    expect(out).toHaveLength(1);
    expect(out[0].translations).toEqual({ pt: "João", en: "John" });
  });

  it("ignora entradas sem term", () => {
    const out = mergeGlossary([], [{ term: "", translations: { pt: "x" } } as GlossaryEntry]);
    expect(out).toHaveLength(0);
  });
});

describe("formatGlossary", () => {
  it("vazio devolve string vazia", () => {
    expect(formatGlossary([], par)).toBe("");
  });

  it("renderiza termos com as traduções do par", () => {
    const out = formatGlossary(
      [{ term: "João", translations: { pt: "João", en: "John" } }],
      par,
    );
    expect(out).toContain("João");
    expect(out).toContain("John");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- glossary`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Create `lib/glossary.ts`**

```ts
import type { GlossaryEntry, LanguagePair } from "@/lib/types";

/**
 * Funde o glossário anterior com termos novos. Mesma chave (term, sem
 * diferenciar maiúsculas) tem as traduções combinadas; o novo sobrescreve
 * traduções conflitantes. Entradas sem `term` são ignoradas.
 */
export function mergeGlossary(
  prev: GlossaryEntry[],
  next: GlossaryEntry[],
): GlossaryEntry[] {
  const byKey = new Map<string, GlossaryEntry>();
  for (const e of [...prev, ...next]) {
    const term = (e?.term ?? "").trim();
    if (!term) continue;
    const key = term.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.translations = { ...existing.translations, ...e.translations };
    } else {
      byKey.set(key, { term, translations: { ...e.translations } });
    }
  }
  return [...byKey.values()];
}

/**
 * Renderiza o glossário para injeção no prompt, mostrando as traduções
 * nos dois idiomas do par. Devolve "" se não houver termos.
 */
export function formatGlossary(entries: GlossaryEntry[], pair: LanguagePair): string {
  if (entries.length === 0) return "";
  const a = pair.langA.code;
  const b = pair.langB.code;
  return entries
    .map((e) => `- ${e.term}: ${a}=${e.translations[a] ?? "?"}, ${b}=${e.translations[b] ?? "?"}`)
    .join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- glossary`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/glossary.ts lib/__tests__/glossary.test.ts
git commit -m "feat(web): memória de glossário (merge + format)"
```

---

### Task 8: Voz por falante (`voiceFor`)

**Files:**
- Create: `lib/voice.ts`
- Test: `lib/__tests__/voice.test.ts`

- [ ] **Step 1: Write the failing test**

Criar `lib/__tests__/voice.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { voiceFor } from "@/lib/voice";
import type { LanguagePair } from "@/lib/types";

const par: LanguagePair = {
  langA: { code: "pt", name: "Português" },
  langB: { code: "en", name: "English" },
};

describe("voiceFor", () => {
  it("idioma A e idioma B usam vozes distintas", () => {
    expect(voiceFor("pt", par)).not.toBe(voiceFor("en", par));
  });
  it("idioma fora do par cai na voz do B (padrão)", () => {
    expect(voiceFor("fr", par)).toBe(voiceFor("en", par));
  });
  it("é determinístico", () => {
    expect(voiceFor("pt", par)).toBe(voiceFor("pt", par));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- voice`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Create `lib/voice.ts`**

```ts
import type { LanguagePair } from "@/lib/types";

// Presets distintos da OpenAI para cada lado da conversa (não é clonagem;
// dá o efeito de "duas pessoas" sem novas dependências).
const VOICE_A = "alloy";
const VOICE_B = "verse";

/**
 * Escolhe a voz do TTS conforme o idioma alvo: idioma A → VOICE_A,
 * idioma B → VOICE_B. Fora do par cai em VOICE_B (alvo padrão).
 */
export function voiceFor(lang: string, pair: LanguagePair): string {
  if (lang === pair.langA.code) return VOICE_A;
  return VOICE_B;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- voice`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/voice.ts lib/__tests__/voice.test.ts
git commit -m "feat(web): voz distinta por falante (voiceFor)"
```

---

### Task 9: `synthesize` recebe a voz

**Files:**
- Modify: `lib/openai.ts`
- Test: `lib/__tests__/openai.test.ts` (estender)

- [ ] **Step 1: Write the failing test**

Acrescentar em `lib/__tests__/openai.test.ts`. Estender o mock para cobrir `audio.speech.create` e testar `synthesize`. Substituir o bloco `vi.mock("openai", ...)` por:

```ts
const create = vi.fn();
const speechCreate = vi.fn();
vi.mock("openai", () => {
  return {
    default: class {
      audio = {
        transcriptions: { create },
        speech: { create: speechCreate },
      };
    },
  };
});
```

E adicionar o teste:

```ts
describe("synthesize", () => {
  it("passa a voz recebida ao TTS e devolve base64", async () => {
    speechCreate.mockResolvedValue({
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    const { synthesize } = await import("@/lib/openai");
    const b64 = await synthesize("hello", "verse");
    expect(typeof b64).toBe("string");
    expect(speechCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4o-mini-tts", voice: "verse", input: "hello" }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- openai`
Expected: FAIL — `synthesize` ignora o 2º argumento (usa `"alloy"` fixo).

- [ ] **Step 3: Edit `lib/openai.ts`**

Trocar a assinatura de `synthesize`:

```ts
/** Sintetiza voz a partir de texto na voz indicada; devolve MP3 em base64. */
export async function synthesize(text: string, voice = "alloy"): Promise<string> {
  const speech = await getClient().audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice,
    input: text,
  });
  const buf = Buffer.from(await speech.arrayBuffer());
  return buf.toString("base64");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- openai`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/openai.ts lib/__tests__/openai.test.ts
git commit -m "feat(web): synthesize aceita voz parametrizada"
```

---

### Task 10: Prompt com glossário, extração e rótulos de idioma

**Files:**
- Modify: `lib/prompt.ts`
- Test: `lib/__tests__/prompt.test.ts` (estender)

- [ ] **Step 1: Write the failing test**

Substituir o teste de `buildTranslationMessages` em `lib/__tests__/prompt.test.ts` por uma versão que cobre glossário, extração e rótulos:

```ts
describe("buildTranslationMessages", () => {
  const history: Turn[] = [{ role: "original", lang: "pt", text: "Bom dia" }];

  it("inclui idiomas, histórico rotulado e a fala atual", () => {
    const msgs = buildTranslationMessages({ text: "Tudo bem?", pair: par, history });
    const blob = JSON.stringify(msgs);
    expect(blob).toContain("Português");
    expect(blob).toContain("English");
    expect(blob).toContain("(pt)");        // rótulo de idioma no histórico
    expect(blob).toContain("Bom dia");
    expect(blob).toContain("Tudo bem?");
    expect(blob.toLowerCase()).toContain("json");
    expect(blob).toContain("glossary");    // instrui extração de glossário
  });

  it("injeta o glossário recebido", () => {
    const msgs = buildTranslationMessages({
      text: "oi", pair: par, history: [],
      glossary: "- João: pt=João, en=John",
    });
    expect(JSON.stringify(msgs)).toContain("John");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- prompt`
Expected: FAIL — `buildTranslationMessages` não aceita `glossary` nem pede extração.

- [ ] **Step 3: Edit `lib/prompt.ts`**

Substituir `buildTranslationMessages` por (mantendo `buildSetupMessages` igual):

```ts
export function buildTranslationMessages(input: {
  text: string;
  pair: LanguagePair;
  history: Turn[];
  glossary?: string;
}): ChatCompletionMessageParam[] {
  const { text, pair, history, glossary } = input;
  const contexto = history.map((t) => `(${t.lang}) ${t.text}`).join("\n");

  return [
    {
      role: "system",
      content:
        "Você é um intérprete simultâneo. Os dois idiomas da conversa são " +
        `${pair.langA.name} (${pair.langA.code}) e ${pair.langB.name} (${pair.langB.code}). ` +
        "Cada linha do histórico vem rotulada com o código do idioma, ex.: (pt) texto. " +
        "A fala do usuário está em UM desses dois idiomas. Detecte qual e traduza para o OUTRO, " +
        "preservando tom, nomes próprios, termos do domínio e nível de formalidade. " +
        "Use o histórico apenas como contexto. " +
        "Mantenha consistência com o GLOSSÁRIO: se um termo já tem tradução canônica, use-a. " +
        "Extraia para 'glossary' nomes próprios e termos técnicos NOVOS desta fala, com sua tradução nos dois idiomas. " +
        'Responda SOMENTE em JSON {"sourceLang":"<código ISO do idioma da fala>","targetText":"<tradução>",' +
        '"glossary":[{"term":"<termo>","translations":{"<código>":"<tradução>","<código>":"<tradução>"}}]}.',
    },
    {
      role: "user",
      content:
        (glossary ? `Glossário (use de forma consistente):\n${glossary}\n\n` : "") +
        (contexto ? `Histórico da conversa:\n${contexto}\n\n` : "") +
        `Fala a traduzir:\n${text}`,
    },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- prompt`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/prompt.ts lib/__tests__/prompt.test.ts
git commit -m "feat(web): prompt com glossário, extração e rótulos de idioma"
```

---

### Task 11: `parseTranslation` lê o glossário

**Files:**
- Modify: `lib/languages.ts`
- Test: `lib/__tests__/languages.test.ts` (estender)

- [ ] **Step 1: Write the failing test**

Acrescentar em `lib/__tests__/languages.test.ts`:

```ts
import { parseTranslation } from "@/lib/languages";
import type { LanguagePair } from "@/lib/types";

const parLang: LanguagePair = {
  langA: { code: "pt", name: "Português" },
  langB: { code: "en", name: "English" },
};

describe("parseTranslation — glossário", () => {
  it("extrai o glossário quando presente", () => {
    const raw = '{"sourceLang":"pt","targetText":"John","glossary":[{"term":"João","translations":{"pt":"João","en":"John"}}]}';
    const out = parseTranslation(raw, parLang);
    expect(out.glossary).toHaveLength(1);
    expect(out.glossary?.[0].term).toBe("João");
  });

  it("glossário ausente vira lista vazia", () => {
    const raw = '{"sourceLang":"pt","targetText":"John"}';
    const out = parseTranslation(raw, parLang);
    expect(out.glossary).toEqual([]);
  });

  it("glossário malformado é ignorado (lista vazia)", () => {
    const raw = '{"sourceLang":"pt","targetText":"John","glossary":"oops"}';
    const out = parseTranslation(raw, parLang);
    expect(out.glossary).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- languages`
Expected: FAIL — retorno de `parseTranslation` não tem `glossary`.

- [ ] **Step 3: Edit `lib/languages.ts`**

Importar o tipo e estender o retorno. Topo:

```ts
import type { GlossaryEntry, LanguagePair } from "@/lib/types";
```

Substituir a assinatura/retorno de `parseTranslation`:

```ts
export function parseTranslation(
  raw: string,
  pair: LanguagePair,
): { sourceLang: string; targetText: string; glossary: GlossaryEntry[] } {
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
    sourceLang = pair.langA.code;
  }
  const glossary: GlossaryEntry[] = Array.isArray(o?.glossary)
    ? o.glossary
        .filter((g: any) => g && typeof g.term === "string" && g.translations && typeof g.translations === "object")
        .map((g: any) => ({ term: String(g.term), translations: g.translations as Record<string, string> }))
    : [];
  return { sourceLang, targetText, glossary };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- languages`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/languages.ts lib/__tests__/languages.test.ts
git commit -m "feat(web): parseTranslation extrai glossário com degradação graciosa"
```

---

### Task 12: Pipeline passa glossário/voz e devolve glossário

**Files:**
- Modify: `lib/translatePipeline.ts`
- Test: `lib/__tests__/translatePipeline.test.ts` (atualizar)

- [ ] **Step 1: Update the test**

Substituir o teste em `lib/__tests__/translatePipeline.test.ts` (o mock atual de `chatJSON` precisa devolver glossário; e `synthesize` agora recebe voz). Trocar o corpo do `it` por:

```ts
  it("transcreve, traduz com roteamento, sintetiza com voz e devolve glossário", async () => {
    vi.mocked(transcribe).mockResolvedValue("Olá João");
    vi.mocked(chatJSON).mockResolvedValue(
      '{"sourceLang":"pt","targetText":"Hello John","glossary":[{"term":"João","translations":{"pt":"João","en":"John"}}]}',
    );
    vi.mocked(synthesize).mockResolvedValue("QUJD");

    const file = new File([new Uint8Array([1])], "f.wav", { type: "audio/wav" });
    const r = await runTranslate({ audio: file, pair: par, history: [], glossaryText: "" });

    expect(r.sourceText).toBe("Olá João");
    expect(r.sourceLang).toBe("pt");
    expect(r.targetLang).toBe("en");
    expect(r.targetText).toBe("Hello John");
    expect(r.audioBase64).toBe("QUJD");
    expect(r.glossary).toHaveLength(1);
    // alvo en = langB → voz distinta de "alloy"
    expect(synthesize).toHaveBeenCalledWith("Hello John", expect.any(String));
    expect(vi.mocked(synthesize).mock.calls[0][1]).not.toBe("");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- translatePipeline`
Expected: FAIL — `runTranslate` não aceita `glossaryText`, não devolve `glossary`, chama `synthesize` com 1 arg.

- [ ] **Step 3: Edit `lib/translatePipeline.ts`**

```ts
import { transcribe, chatJSON, synthesize } from "@/lib/openai";
import { buildTranslationMessages } from "@/lib/prompt";
import { parseTranslation } from "@/lib/languages";
import { resolveTarget } from "@/lib/routing";
import { voiceFor } from "@/lib/voice";
import type { LanguagePair, Turn, TranslateResult } from "@/lib/types";

/** Pipeline completo de uma fala: STT → tradução com contexto/glossário → TTS. */
export async function runTranslate(input: {
  audio: File;
  pair: LanguagePair;
  history: Turn[];
  glossaryText?: string;
}): Promise<TranslateResult> {
  const { audio, pair, history, glossaryText } = input;

  const sourceText = await transcribe(audio);
  const raw = await chatJSON(
    buildTranslationMessages({ text: sourceText, pair, history, glossary: glossaryText }),
  );
  const { sourceLang, targetText, glossary } = parseTranslation(raw, pair);
  const targetLang = resolveTarget(sourceLang, pair).code;
  const audioBase64 = await synthesize(targetText, voiceFor(targetLang, pair));

  return { sourceText, sourceLang, targetText, targetLang, audioBase64, glossary };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- translatePipeline`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/translatePipeline.ts lib/__tests__/translatePipeline.test.ts
git commit -m "feat(web): pipeline com glossário e voz por falante"
```

---

### Task 13: Rota translate lê o glossário; hook envia e funde

**Files:**
- Modify: `app/api/translate/route.ts`
- Modify: `hooks/useConversation.ts`

Nota: rota e hook são wiring; a lógica já é testada nas units. Verificação manual no fim.

- [ ] **Step 1: Edit `app/api/translate/route.ts`**

Ler o campo `glossary` do FormData e repassar. Substituir o corpo do `POST` (após validação) por:

```ts
    const pair = JSON.parse(pairRaw) as LanguagePair;
    const history = (typeof historyRaw === "string" ? JSON.parse(historyRaw) : []) as Turn[];
    const glossaryRaw = form.get("glossary");
    const glossaryText = typeof glossaryRaw === "string" ? glossaryRaw : "";

    const result = await runTranslate({ audio, pair, history, glossaryText });
    return NextResponse.json(result);
```

- [ ] **Step 2: Edit `hooks/useConversation.ts`**

Importar helpers de glossário no topo:

```ts
import { mergeGlossary, formatGlossary } from "@/lib/glossary";
```

Adicionar ref do glossário junto aos outros refs:

```ts
  const glossaryRef = useRef(state.glossary);
  glossaryRef.current = state.glossary;
```

No bloco ACTIVE do `handleSpeech`, anexar o glossário formatado ao FormData (logo após o `history`):

```ts
        fd.append("glossary", formatGlossary(glossaryRef.current, pairRef.current));
```

E, após receber `r` e antes/depois de `ADD_TURNS`, fundir o glossário novo:

```ts
        if (r.glossary && r.glossary.length) {
          dispatch({ type: "SET_GLOSSARY", glossary: mergeGlossary(glossaryRef.current, r.glossary) });
        }
```

- [ ] **Step 3: Run full suite**

Run: `npm test`
Expected: PASS (todos)

- [ ] **Step 4: Manual smoke (glossário)**

Run: `npm run dev`. Sessão pt⇄en. Fale um nome próprio em vários turnos; confirme que a tradução do nome fica consistente e que vozes diferem por lado.

- [ ] **Step 5: Commit**

```bash
git add app/api/translate/route.ts hooks/useConversation.ts
git commit -m "feat(web): glossário ponta a ponta (rota + hook)"
```

---

## FASE 3 — Wow / persistência

### Task 14: Mensagens de recap (`buildRecapMessages`)

**Files:**
- Create: `lib/recap.ts`
- Test: `lib/__tests__/recap.test.ts`

- [ ] **Step 1: Write the failing test**

Criar `lib/__tests__/recap.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildRecapMessages } from "@/lib/recap";
import type { LanguagePair, Turn } from "@/lib/types";

const par: LanguagePair = {
  langA: { code: "pt", name: "Português" },
  langB: { code: "en", name: "English" },
};

describe("buildRecapMessages", () => {
  it("inclui os dois idiomas e os turnos da conversa", () => {
    const turns: Turn[] = [
      { role: "original", lang: "pt", text: "Bom dia" },
      { role: "translation", lang: "en", text: "Good morning" },
    ];
    const msgs = buildRecapMessages({ pair: par, turns });
    const blob = JSON.stringify(msgs);
    expect(blob).toContain("Português");
    expect(blob).toContain("English");
    expect(blob).toContain("Bom dia");
    expect(blob).toContain("Good morning");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- recap`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Create `lib/recap.ts`**

```ts
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { LanguagePair, Turn } from "@/lib/types";

/**
 * Monta as mensagens para um resumo bilíngue curto da conversa.
 * O modelo deve devolver texto corrido nos dois idiomas do par.
 */
export function buildRecapMessages(input: {
  pair: LanguagePair;
  turns: Turn[];
}): ChatCompletionMessageParam[] {
  const { pair, turns } = input;
  const transcript = turns.map((t) => `(${t.lang}) ${t.text}`).join("\n");
  return [
    {
      role: "system",
      content:
        "Você resume conversas traduzidas. Faça um resumo curto (3-5 frases) dos pontos principais " +
        `e de qualquer combinação/decisão. Escreva o resumo em ${pair.langA.name} e depois em ${pair.langB.name}, ` +
        "separados por uma linha em branco.",
    },
    { role: "user", content: `Conversa:\n${transcript}` },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- recap`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/recap.ts lib/__tests__/recap.test.ts
git commit -m "feat(web): mensagens de recap bilíngue"
```

---

### Task 15: Pipeline e rota de recap

**Files:**
- Create: `lib/recapPipeline.ts`
- Create: `app/api/recap/route.ts`
- Test: `lib/__tests__/recapPipeline.test.ts`

- [ ] **Step 1: Write the failing test**

Criar `lib/__tests__/recapPipeline.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/openai", () => ({ chatText: vi.fn() }));

import { chatText } from "@/lib/openai";
import { runRecap } from "@/lib/recapPipeline";
import type { LanguagePair } from "@/lib/types";

const par: LanguagePair = {
  langA: { code: "pt", name: "Português" },
  langB: { code: "en", name: "English" },
};

beforeEach(() => vi.mocked(chatText).mockReset());

describe("runRecap", () => {
  it("devolve o texto do resumo", async () => {
    vi.mocked(chatText).mockResolvedValue("Resumo...");
    const out = await runRecap({ pair: par, turns: [] });
    expect(out).toBe("Resumo...");
    expect(chatText).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- recapPipeline`
Expected: FAIL — `chatText` e `runRecap` não existem.

- [ ] **Step 3: Add `chatText` to `lib/openai.ts`**

Acrescentar (texto livre, sem `response_format` JSON):

```ts
/** Chat completion que devolve texto livre. */
export async function chatText(
  messages: ChatCompletionMessageParam[],
  model = "gpt-4o-mini",
): Promise<string> {
  const c = await getClient().chat.completions.create({ model, messages, temperature: 0.3 });
  return c.choices[0]?.message?.content ?? "";
}
```

- [ ] **Step 4: Create `lib/recapPipeline.ts`**

```ts
import { chatText } from "@/lib/openai";
import { buildRecapMessages } from "@/lib/recap";
import type { LanguagePair, Turn } from "@/lib/types";

/** Gera o resumo bilíngue da conversa. */
export async function runRecap(input: { pair: LanguagePair; turns: Turn[] }): Promise<string> {
  return chatText(buildRecapMessages(input));
}
```

- [ ] **Step 5: Create `app/api/recap/route.ts`**

```ts
import { NextResponse } from "next/server";
import { runRecap } from "@/lib/recapPipeline";
import type { LanguagePair, Turn } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { pair?: LanguagePair; turns?: Turn[] };
    if (!body.pair || !Array.isArray(body.turns)) {
      return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
    }
    const summary = await runRecap({ pair: body.pair, turns: body.turns });
    return NextResponse.json({ summary });
  } catch (e) {
    console.error("[recap] erro:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha no resumo." },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- recapPipeline`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/openai.ts lib/recapPipeline.ts app/api/recap/route.ts lib/__tests__/recapPipeline.test.ts
git commit -m "feat(web): pipeline e rota de recap"
```

---

### Task 16: Painel de recap na UI

**Files:**
- Create: `components/RecapPanel.tsx`
- Modify: `app/page.tsx`

Nota: UI de wiring; lógica de geração já testada. Verificação manual.

- [ ] **Step 1: Create `components/RecapPanel.tsx`**

```tsx
"use client";

type Props = { text: string; loading: boolean; onClose: () => void };

/** Painel com o resumo da conversa, com copiar e compartilhar. */
export function RecapPanel({ text, loading, onClose }: Props) {
  const copiar = () => void navigator.clipboard?.writeText(text);
  const compartilhar = () => {
    if (navigator.share) void navigator.share({ text });
    else copiar();
  };
  return (
    <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Resumo</h2>
          <button onClick={onClose} className="text-sm text-gray-500 underline">fechar</button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-sm text-gray-700">
          {loading ? "gerando resumo…" : text}
        </div>
        {!loading && text && (
          <div className="mt-3 flex gap-4">
            <button onClick={copiar} className="text-sm text-blue-600 underline">copiar</button>
            <button onClick={compartilhar} className="text-sm text-blue-600 underline">compartilhar</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Edit `app/page.tsx`**

Adicionar estado local do recap e o botão. Importar no topo:

```tsx
import { useState } from "react";
import { RecapPanel } from "@/components/RecapPanel";
```

Dentro do componente `Home`, após desestruturar `useConversation`, adicionar:

```tsx
  const [recap, setRecap] = useState<{ open: boolean; loading: boolean; text: string }>({
    open: false, loading: false, text: "",
  });

  const gerarRecap = async () => {
    setRecap({ open: true, loading: true, text: "" });
    try {
      const res = await fetch("/api/recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pair: state.pair, turns: state.turns }),
      });
      const data = await res.json();
      setRecap({ open: true, loading: false, text: data.summary ?? data.error ?? "" });
    } catch {
      setRecap({ open: true, loading: false, text: "Falha ao gerar o resumo." });
    }
  };
```

No bloco de botões da fase ACTIVE (junto de "silenciar voz"/"resetar idiomas"), adicionar:

```tsx
            <button onClick={gerarRecap} className="text-sm text-gray-500 underline">
              resumo
            </button>
```

E antes do fechamento de `</main>`, renderizar o painel:

```tsx
      {recap.open && (
        <RecapPanel
          text={recap.text}
          loading={recap.loading}
          onClose={() => setRecap((r) => ({ ...r, open: false }))}
        />
      )}
```

- [ ] **Step 3: Run full suite + build**

Run: `npm test && npm run build`
Expected: testes PASS; build sem erros de tipo.

- [ ] **Step 4: Manual smoke (recap)**

Run: `npm run dev`. Após alguns turnos, clicar "resumo"; confirmar resumo bilíngue, copiar/compartilhar.

- [ ] **Step 5: Commit**

```bash
git add components/RecapPanel.tsx app/page.tsx
git commit -m "feat(web): painel de recap com copiar/compartilhar"
```

---

### Task 17: Persistência de sessão (`loadSession`/`saveSession`)

**Files:**
- Create: `lib/session.ts`
- Test: `lib/__tests__/session.test.ts`

- [ ] **Step 1: Write the failing test**

Criar `lib/__tests__/session.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadSession, saveSession } from "@/lib/session";
import type { LanguagePair } from "@/lib/types";

const par: LanguagePair = {
  langA: { code: "pt", name: "Português" },
  langB: { code: "en", name: "English" },
};

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

describe("session", () => {
  it("salva e recarrega a sessão", () => {
    saveSession({ pair: par, turns: [{ role: "original", lang: "pt", text: "oi" }], glossary: [] });
    const s = loadSession();
    expect(s?.pair.langA.code).toBe("pt");
    expect(s?.turns).toHaveLength(1);
  });

  it("sem dados salvos retorna null", () => {
    expect(loadSession()).toBeNull();
  });

  it("versão incompatível é ignorada", () => {
    localStorage.setItem("traduzai.session", JSON.stringify({ v: 0, pair: par, turns: [], glossary: [] }));
    expect(loadSession()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- session`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Create `lib/session.ts`**

```ts
import type { GlossaryEntry, LanguagePair, Turn } from "@/lib/types";

const KEY = "traduzai.session";
const VERSION = 1;

export type SavedSession = { pair: LanguagePair; turns: Turn[]; glossary: GlossaryEntry[] };

/** Persiste a sessão atual no localStorage (chave versionada). */
export function saveSession(s: SavedSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...s }));
  } catch {
    // Sem localStorage (SSR/privado): ignora silenciosamente.
  }
}

/** Recarrega a sessão salva, ou null se ausente/incompatível. */
export function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (o?.v !== VERSION || !o?.pair?.langA?.code) return null;
    return { pair: o.pair, turns: o.turns ?? [], glossary: o.glossary ?? [] };
  } catch {
    return null;
  }
}

/** Apaga a sessão salva. */
export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignora
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- session`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/session.ts lib/__tests__/session.test.ts
git commit -m "feat(web): persistência de sessão em localStorage"
```

---

### Task 18: Reidratar e persistir no useConversation

**Files:**
- Modify: `hooks/useConversation.ts`

Nota: wiring; funções de storage já testadas.

- [ ] **Step 1: Edit `hooks/useConversation.ts`**

Importar no topo:

```ts
import { useEffect } from "react";
import { loadSession, saveSession, clearSession } from "@/lib/session";
```

(adicionar `useEffect` ao import existente de "react").

Após criar `[state, dispatch]`, reidratar uma vez na montagem:

```ts
  // Reidrata a sessão salva (par, turnos, glossário) ao montar.
  useEffect(() => {
    const saved = loadSession();
    if (saved) {
      dispatch({ type: "HYDRATE", pair: saved.pair, turns: saved.turns, glossary: saved.glossary });
    }
  }, []);

  // Persiste sempre que par/turnos/glossário mudarem em sessão ativa.
  useEffect(() => {
    if (state.phase === "ACTIVE" && state.pair) {
      saveSession({ pair: state.pair, turns: state.turns, glossary: state.glossary });
    }
  }, [state.phase, state.pair, state.turns, state.glossary]);
```

No `reset`, limpar o storage. Substituir o corpo de `reset` por:

```ts
  const reset = useCallback(() => {
    stop();
    clearSession();
    dispatch({ type: "RESET" });
  }, [stop]);
```

Nota: ao reidratar em ACTIVE, a UI mostra "ouvindo" mas o VAD ainda não está rodando até o usuário tocar "retomar" (mode = paused, pois `listening` é false). Comportamento aceitável: a conversa volta visível e o usuário retoma a escuta com um toque.

- [ ] **Step 2: Run full suite + build**

Run: `npm test && npm run build`
Expected: testes PASS; build OK.

- [ ] **Step 3: Manual smoke (persistência)**

Run: `npm run dev`. Faça alguns turnos, recarregue a página (F5); confirme que par/turnos reaparecem. "resetar idiomas" limpa tudo.

- [ ] **Step 4: Commit**

```bash
git add hooks/useConversation.ts
git commit -m "feat(web): reidratação e persistência da sessão"
```

---

### Task 19: Atualizar README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Edit `README.md`**

Adicionar, após a seção do pipeline, uma seção de diferenciais:

```markdown
## Diferenciais vs tradutor genérico

- **Memória de glossário** — nomes próprios e termos de domínio ficam consistentes na conversa inteira.
- **Voz por falante** — cada idioma usa uma voz distinta (efeito de duas pessoas).
- **Contexto de conversa** — cada tradução considera os turnos anteriores.
- **Guarda de eco** — o microfone pausa durante a fala traduzida (sem loop).
- **Resumo bilíngue** — gere um recap da conversa e compartilhe.
- **Sessão persistente** — par de idiomas, histórico e glossário sobrevivem ao refresh.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(web): documenta diferenciais do app"
```

---

## Streaming TTS — deferido

Playback progressivo do primeiro chunk (MediaSource + streaming da OpenAI speech) fica **fora deste plano**. É frágil no browser e não bloqueia nenhuma das features acima. Tratar como trabalho separado, com seu próprio spec, se a meta de latência exigir.

---

## Verificação final

- [ ] `npm test` — toda a suíte passa.
- [ ] `npm run build` — sem erros de tipo.
- [ ] Smoke manual: echo-guard (sem loop), glossário consistente, vozes distintas, recap bilíngue, persistência no refresh.
