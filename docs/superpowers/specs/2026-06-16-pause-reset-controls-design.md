# Pause + Reset Controls — Design

**Data:** 2026-06-16
**Escopo:** Web app (`web/`)

## Problema

Atualmente, depois de iniciar a conversa, o usuário não tem como:

1. Parar a escuta sem perder o contexto (idiomas + histórico de turnos).
2. Resetar a sessão (apagar idiomas e turnos) para reconfigurar.

A UI só expõe iniciar e silenciar voz (mute do TTS).

## Solução

Dois controles novos:

1. **Pausar/Retomar** — BigButton vira toggle quando a sessão está em `ACTIVE`. Para o VAD (microfone) sem alterar `pair` ou `turns`. Retomar restaura escuta no mesmo contexto.
2. **Resetar idiomas** — link secundário ao lado de "silenciar voz". Para o VAD, apaga `pair` + `turns`, volta ao `IDLE`. Sem confirmação.

## Mudanças

### `lib/conversationMachine.ts`

Sem alterações de tipos ou actions. `RESET` já cobre o caso de reset. Pause é estado implícito: `phase` permanece `ACTIVE`, `status` vira `"pausado"`, e `listening` do hook de VAD fica `false`.

Trade-off: evita inflar a máquina com action redundante; custo é que o estado "pausado" é derivado de duas fontes (`status` + `listening`). Aceitável porque `listening` já é a fonte da verdade visual.

### `hooks/useConversation.ts`

Expor 2 callbacks novos:

```ts
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
```

`reset` já existe no hook (chama `stop()` + dispatch `RESET`) mas não estava sendo exposto na UI. Mantém implementação atual.

Assinatura final do retorno: `{ state, listening, begin, pause, resume, reset, toggleMute }`.

### `components/BigButton.tsx`

Trocar props para discriminated union por modo:

```ts
type Props =
  | { mode: "idle"; onClick: () => void }
  | { mode: "listening"; onClick: () => void }
  | { mode: "paused"; onClick: () => void };
```

Labels e estilos:

| mode | label | cor | animação |
|---|---|---|---|
| `idle` | iniciar | azul (`bg-blue-600`) | scale on press |
| `listening` | pausar | verde (`bg-green-500`) | `animate-pulse` |
| `paused` | retomar | azul (`bg-blue-600`) | scale on press |

`disabled` removido — botão sempre clicável (cada modo tem ação válida).

### `app/page.tsx`

Lógica de render:

```tsx
const { state, listening, begin, pause, resume, reset, toggleMute } = useConversation();

// modo do BigButton
const mode =
  state.phase === "ACTIVE"
    ? listening ? "listening" : "paused"
    : "idle";

const handleClick =
  mode === "idle" ? begin : mode === "listening" ? pause : resume;
```

JSX:

- Header inalterado.
- `ConversationLog` inalterado.
- BigButton: `<BigButton mode={mode} onClick={handleClick} />`.
- Abaixo do botão, quando `phase === "ACTIVE"` (independente de `listening`):
  - Link "silenciar voz" / "ativar voz" (toggleMute) — comportamento atual preservado.
  - Link "resetar idiomas" → `onClick={reset}`.

Ambos como `<button className="text-sm text-gray-500 underline">`.

### Testes

- `lib/__tests__/conversationMachine.test.ts` — nenhum teste novo necessário (sem mudanças no reducer).
- Hook tests existentes continuam passando.
- Não adicionar testes de UI novos (escopo mínimo).

## Fluxos do usuário

**Pausar e retomar:**

1. Usuário em ACTIVE + listening → vê botão verde "pausar".
2. Clica → VAD para, status vira "pausado", botão fica azul "retomar".
3. Clica de novo → VAD volta, status "ouvindo", botão verde "pausar".
4. Idiomas e turnos preservados durante todo o ciclo.

**Resetar:**

1. Usuário em ACTIVE (listening ou paused) → vê link "resetar idiomas".
2. Clica → `stop()` + `dispatch RESET` → volta IDLE com `turns: []`, sem `pair`.
3. BigButton volta a "iniciar".

## Fora do escopo

- Modal de confirmação de reset (decidido: sem confirmação).
- Botão de parar só o TTS (decidido: fora do escopo agora).
- Persistir conversa entre sessões.
