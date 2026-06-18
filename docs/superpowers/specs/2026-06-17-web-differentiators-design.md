# Design — Melhorias do app web TraduzAI (diferenciação vs Google Tradutor)

**Data:** 2026-06-17
**Status:** aprovado (design), aguardando revisão do spec
**Escopo:** app `web/` (Next.js). Não toca firmware nem backend FastAPI.

## Contexto

O app web hoje faz tradução simultânea de voz no navegador:

```
VAD (browser) → STT (gpt-4o-transcribe) → tradução com 6 turnos de contexto (gpt-4o-mini) → TTS (gpt-4o-mini-tts) → playback
```

Já supera o Google Tradutor em: contexto de conversa entre turnos, captura hands-free por VAD, e preservação de tom/formalidade no prompt. O objetivo deste trabalho é **endurecer a base** e **ampliar a diferenciação** com features que o modo conversa do Google não tem.

Toda a stack permanece **OpenAI-only** (sem adicionar ElevenLabs). Diferenciação de voz usa presets distintos da OpenAI, não clonagem.

## Objetivo

Entregar, em **três fases independentes e testáveis**, melhorias que:

1. Corrijam bugs reais de robustez (Fase 1).
2. Aumentem a diferenciação prática vs Google Tradutor (Fase 2).
3. Adicionem valor de demonstração e persistência (Fase 3).

Cada fase segue a estrutura existente (`lib/` puro + hooks + componentes) e o padrão de testes com vitest já presente.

---

## Fase 1 — Robustez (fundação)

### 1.1 Guarda de eco / barge-in

**Problema:** durante o playback do TTS, o VAD continua escutando. O microfone capta a própria fala traduzida e dispara um novo turno → loop de tradução do próprio áudio.

**Design:** no `useConversation`, antes de `playBase64Audio` chamar `stop()` do VAD; depois do áudio terminar, chamar `start()` de novo. O hook `useMicVAD` já expõe `start`/`stop` (pause/resume do MicVAD). Enquanto `muted`, não há playback, então não há pausa.

- Guardar estado de "tocando" para a UI (status `falando…` já existe).
- Garantir `start()` no `finally` para não deixar o mic morto se o playback falhar.

**Teste:** unidade no reducer/hook não cobre áudio real; cobrir a lógica de sequência com um teste do orquestrador (mock de `playBase64Audio`, asserir ordem stop→play→start).

### 1.2 Pin de versão dos assets VAD/ORT

**Problema:** `useMicVAD` carrega assets de `@latest` via CDN — drift de versão e cold load mais lento.

**Design:** trocar `@latest` pelas versões instaladas no `package.json` (`@ricky0123/vad-web@0.0.30`, `onnxruntime-web@1.26.0`). Centralizar as strings de versão para fácil manutenção.

**Teste:** asserir que as constantes de path não contêm `@latest`.

### 1.3 Guarda de concorrência

**Problema:** se uma nova fala terminar enquanto o pipeline anterior ainda roda, dois fetches concorrem e os turnos podem entrar fora de ordem.

**Design:** flag `busyRef` no `useConversation`. Se `busy`, ignorar a nova fala (drop) e sinalizar status curto (`processando…`). Drop é aceitável no MVP — fala simultânea não é o caso de uso.

**Teste:** orquestrador rejeita segunda chamada enquanto a primeira não resolveu.

---

## Fase 2 — Diferenciadores

### 2.1 Memória de glossário

**Problema:** nomes próprios e termos de domínio variam entre turnos (`João`→`John`→`Joao`), porque cada tradução só vê texto bruto do histórico.

**Design:**
- Novo `lib/glossary.ts`: tipo `GlossaryEntry = { term: string; translations: Record<string, string> }` e funções puras `mergeGlossary(prev, novas)` e `formatGlossary(entries, pair)` (renderiza para o prompt).
- O passo de tradução passa a devolver, além de `targetText` e `sourceLang`, um array opcional `glossary` com termos novos/canônicos detectados naquela fala. Prompt instrui o modelo a extrair nomes próprios e termos técnicos com sua tradução canônica.
- `useConversation` mantém `glossaryRef`, faz merge a cada turno e injeta `formatGlossary(...)` no prompt da próxima tradução (via campo no FormData, como `pair`/`history`).
- Estado guardado em `ConversationState.glossary` (novo campo) para persistência (Fase 3) e debug.

**Por que diferencia:** o Google traduz cada enunciado isolado; nunca garante que "Dr. Silva" ou "anastomose" saiam iguais a conversa inteira.

**Teste:** `mergeGlossary` (dedup, override de canônico), `formatGlossary` (formato estável), e `parseTranslation` estendido para ler o campo `glossary` com degradação graciosa quando ausente.

### 2.2 Voz por falante

**Problema:** `synthesize` usa sempre `"alloy"` — os dois lados soam idênticos.

**Design:**
- `lib/voice.ts`: `voiceFor(lang: string, pair: LanguagePair): string` mapeia `langA`→preset 1, `langB`→preset 2 (ex.: `alloy` e `verse`). Determinístico, fora-do-par cai no preset do alvo.
- `synthesize(text, voice)` recebe a voz; pipeline calcula a voz a partir do `targetLang`.

**Por que diferencia:** a conversa soa como duas pessoas, não um robô só. Forte efeito de demo.

**Teste:** `voiceFor` (mapeamento determinístico, fora-do-par), `synthesize` chamado com a voz certa (mock).

### 2.3 Histórico rotulado por falante

**Design:** reforçar no prompt de tradução que cada linha do histórico já vem com o código do idioma `(en) ...`, para afiar a detecção de `sourceLang`. Mudança só de prompt; sem novo dado.

**Teste:** ajuste no teste de `buildTranslationMessages` (presença do rótulo/instrução).

---

## Fase 3 — Wow / persistência

### 3.1 Recap + export

**Design:**
- Nova rota `app/api/recap/route.ts` (`POST`): recebe `pair` + `turns`, chama `chatJSON`/chat para gerar resumo bilíngue curto da conversa. Novo `lib/recap.ts` puro monta as mensagens; pipeline fino chama OpenAI.
- UI: botão "resumo" na fase ACTIVE → busca o recap → mostra em um painel com botão copiar (Clipboard API) e `navigator.share` quando disponível.

**Por que diferencia:** caso de uso reunião/consulta médica — Google não resume a conversa traduzida.

**Teste:** `buildRecapMessages` (inclui ambos idiomas e turnos), rota com mock do pipeline.

### 3.2 Persistência (localStorage)

**Design:** persistir `pair`, `turns` e `glossary` em `localStorage` sob uma chave versionada. Ao montar, `useConversation` reidrata o estado (fase volta a ACTIVE se houver `pair`). Reset limpa a chave.

**Teste:** funções puras `loadSession`/`saveSession` (serialização, chave ausente, versão incompatível → ignora).

### 3.3 Streaming TTS (stretch, opcional)

**Design:** tentar playback progressivo do primeiro chunk via streaming da OpenAI speech + MediaSource. Fiddly no browser; só se as fases anteriores fecharem. Pode ser cortado sem impacto nas demais.

**Teste:** a definir; provavelmente integração manual.

---

## Não-objetivos (YAGNI)

- Clonagem de voz / ElevenLabs no web.
- Multi-usuário / contas / backend de persistência.
- Tradução de texto digitado (o app é voz-first).
- Streaming TTS é explicitamente opcional/stretch.

## Arquitetura — onde cada coisa vive

| Unidade | Arquivo | Responsabilidade |
|---|---|---|
| Glossário (puro) | `lib/glossary.ts` (novo) | merge + format de termos |
| Voz (puro) | `lib/voice.ts` (novo) | mapa idioma→preset |
| Recap (puro) | `lib/recap.ts` (novo) | monta mensagens do resumo |
| Persistência (puro) | `lib/session.ts` (novo) | load/save localStorage |
| Prompt | `lib/prompt.ts` | extração de glossário + rótulos |
| Pipeline | `lib/translatePipeline.ts`, `lib/openai.ts` | passa glossário/voz |
| Orquestração | `hooks/useConversation.ts` | guards, glossaryRef, busyRef, reidratação |
| VAD | `hooks/useMicVAD.ts` | pin de versão |
| Rotas | `app/api/translate`, `app/api/recap` (novo) | I/O HTTP |
| UI | `app/page.tsx`, `components/*` | botão recap, painel, status |

Cada unidade pura é testável isolada; hooks orquestram. Mantém o padrão atual.

## Critérios de sucesso

- Fase 1: sem loop de eco; cold load reproduzível; sem turnos fora de ordem.
- Fase 2: nomes/termos consistentes na conversa inteira; vozes distintas por lado.
- Fase 3: resumo gerado e copiável; sessão sobrevive a refresh.
- Todos os testes vitest passam (`npm test`).
