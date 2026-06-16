# Pause + Reset Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar dois controles na UI do app web: BigButton pausa/retoma a escuta (sem perder contexto) e link "resetar idiomas" apaga sessão.

**Architecture:** Nenhuma mudança no reducer. BigButton ganha prop discriminada `mode` ("idle" | "listening" | "paused"). Hook `useConversation` ganha `pause()` e `resume()` que só param/iniciam o VAD e atualizam `status`; `reset` já existe e passa a ser exposto. `page.tsx` deriva `mode` de `phase + listening` e wireia callbacks.

**Tech Stack:** Next.js 16 (web/), React 19, Vitest + Testing Library, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-16-pause-reset-controls-design.md`

---

### Task 1: BigButton com modo discriminado

**Files:**
- Create: `web/components/__tests__/BigButton.test.tsx`
- Modify: `web/components/BigButton.tsx`

- [ ] **Step 1: Escrever testes que falham para os 3 modos**

Criar `web/components/__tests__/BigButton.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BigButton } from "@/components/BigButton";

describe("BigButton", () => {
  it("mode=idle mostra 'iniciar' e dispara onClick", async () => {
    const onClick = vi.fn();
    render(<BigButton mode="idle" onClick={onClick} />);
    const btn = screen.getByRole("button", { name: /iniciar/i });
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("mode=listening mostra 'pausar' e dispara onClick", async () => {
    const onClick = vi.fn();
    render(<BigButton mode="listening" onClick={onClick} />);
    const btn = screen.getByRole("button", { name: /pausar/i });
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("mode=paused mostra 'retomar' e dispara onClick", async () => {
    const onClick = vi.fn();
    render(<BigButton mode="paused" onClick={onClick} />);
    const btn = screen.getByRole("button", { name: /retomar/i });
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

```bash
cd web && npx vitest run components/__tests__/BigButton.test.tsx
```

Esperado: 3 testes falham com erro de tipos / props (props atuais são `active` e `onStart`).

- [ ] **Step 3: Reescrever BigButton com `mode` discriminado**

Substituir `web/components/BigButton.tsx` por:

```tsx
type Props =
  | { mode: "idle"; onClick: () => void }
  | { mode: "listening"; onClick: () => void }
  | { mode: "paused"; onClick: () => void };

const LABELS: Record<Props["mode"], string> = {
  idle: "iniciar",
  listening: "pausar",
  paused: "retomar",
};

/** Botão central grande: alterna entre iniciar, pausar e retomar a sessão. */
export function BigButton({ mode, onClick }: Props) {
  const isListening = mode === "listening";
  return (
    <button
      onClick={onClick}
      className={`h-40 w-40 rounded-full text-white text-xl font-semibold shadow-lg transition
        ${isListening ? "bg-green-500 animate-pulse" : "bg-blue-600 active:scale-95"}`}
    >
      {LABELS[mode]}
    </button>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

```bash
cd web && npx vitest run components/__tests__/BigButton.test.tsx
```

Esperado: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add web/components/BigButton.tsx web/components/__tests__/BigButton.test.tsx
git commit -m "feat(web): BigButton com modos idle/listening/paused"
```

---

### Task 2: pause/resume no useConversation + expor reset

**Files:**
- Modify: `web/hooks/useConversation.ts`

- [ ] **Step 1: Adicionar pause/resume e ajustar retorno**

Substituir o bloco final de `web/hooks/useConversation.ts` (das linhas com `begin`, `reset`, `toggleMute` e `return`) por:

```ts
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

  const pause = useCallback(() => {
    stop();
    dispatch({ type: "SET_STATUS", status: "pausado" });
  }, [stop]);

  const resume = useCallback(async () => {
    try {
      await start();
      dispatch({ type: "SET_STATUS", status: "ouvindo" });
    } catch {
      dispatch({ type: "ERROR", error: "Falha ao retomar microfone." });
    }
  }, [start]);

  const reset = useCallback(() => {
    stop();
    dispatch({ type: "RESET" });
  }, [stop]);

  const toggleMute = useCallback(() => dispatch({ type: "TOGGLE_MUTE" }), []);

  return { state, listening, begin, pause, resume, reset, toggleMute };
}
```

- [ ] **Step 2: Garantir que reducer existente ainda passa**

```bash
cd web && npx vitest run lib/__tests__/conversationMachine.test.ts
```

Esperado: 5 PASS.

- [ ] **Step 3: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add web/hooks/useConversation.ts
git commit -m "feat(web): pause/resume e reset expostos no useConversation"
```

---

### Task 3: Wiring na page.tsx

**Files:**
- Modify: `web/app/page.tsx`

- [ ] **Step 1: Substituir page.tsx pelo novo render**

Substituir `web/app/page.tsx` por:

```tsx
"use client";

import { useConversation } from "@/hooks/useConversation";
import { StatusIndicator } from "@/components/StatusIndicator";
import { BigButton } from "@/components/BigButton";
import { ConversationLog } from "@/components/ConversationLog";

export default function Home() {
  const { state, listening, begin, pause, resume, reset, toggleMute } = useConversation();
  const pairLabel = state.pair
    ? `${state.pair.langA.code.toUpperCase()} ⇄ ${state.pair.langB.code.toUpperCase()}`
    : undefined;

  const mode: "idle" | "listening" | "paused" =
    state.phase === "ACTIVE" ? (listening ? "listening" : "paused") : "idle";

  const handleClick =
    mode === "idle" ? begin : mode === "listening" ? pause : resume;

  return (
    <main className="flex min-h-screen flex-col items-center justify-between gap-6 p-6">
      <header className="pt-8">
        <h1 className="text-2xl font-bold text-center">TraduzAI</h1>
        <StatusIndicator status={state.status} pairLabel={pairLabel} />
      </header>

      <ConversationLog turns={state.turns} />

      <div className="flex flex-col items-center gap-4 pb-10">
        <BigButton mode={mode} onClick={handleClick} />
        {state.phase === "ACTIVE" && (
          <div className="flex gap-4">
            <button onClick={toggleMute} className="text-sm text-gray-500 underline">
              {state.muted ? "ativar voz" : "silenciar voz"}
            </button>
            <button onClick={reset} className="text-sm text-gray-500 underline">
              resetar idiomas
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Build de produção**

```bash
cd web && npm run build
```

Esperado: `✓ Compiled successfully`, rotas `/`, `/api/translate`, `/api/setup-languages` listadas.

- [ ] **Step 4: Commit**

```bash
git add web/app/page.tsx
git commit -m "feat(web): controles de pausar e resetar na tela principal"
```

---

### Task 4: Verificação final + smoke manual

**Files:** nenhum.

- [ ] **Step 1: Rodar suite completa**

```bash
cd web && npm test
```

Esperado: todos os testes PASS (incluindo os 3 novos do BigButton e os 5 do conversationMachine).

- [ ] **Step 2: Lint**

```bash
cd web && npm run lint
```

Esperado: sem erros.

- [ ] **Step 3: Smoke manual no dev server**

```bash
cd web && npm run dev
```

Abrir `http://localhost:3000` e verificar:

1. **Fluxo de start:** BigButton mostra "iniciar" (azul). Clica → vira "pausar" (verde, pulsando). Status: "diga os dois idiomas".
2. **Após setup de idiomas:** par configurado, status "ouvindo", BigButton continua "pausar".
3. **Pausar:** clica BigButton → vira "retomar" (azul). Status: "pausado". VAD parou (silencioso).
4. **Retomar:** clica → volta a "pausar" (verde). Status: "ouvindo". VAD reativo.
5. **Resetar idiomas:** com sessão ativa (listening OU paused), clica link "resetar idiomas". BigButton volta a "iniciar". `ConversationLog` esvazia. Sem `pair`.
6. **Silenciar voz:** continua funcionando como antes em ambos os estados listening/paused.

- [ ] **Step 4: Sem commit (verificação só)**

Se tudo OK, plano completo. Push opcional:

```bash
git push origin main
```
