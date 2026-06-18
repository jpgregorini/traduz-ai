# TraduzAI Web

Tradução simultânea por voz no navegador do celular. O usuário fala os dois idiomas da conversa, e a partir daí cada fala é traduzida (texto + voz) no idioma do outro, levando o **contexto da conversa** em conta.

Pipeline (tudo OpenAI, em rotas serverless):

```
voz → STT (gpt-4o-transcribe) → tradução com contexto (gpt-4o-mini) → TTS (gpt-4o-mini-tts) → voz
```

Captura hands-free com VAD no browser (`@ricky0123/vad-web`). A chave da OpenAI fica só no servidor.

## Diferenciais vs tradutor genérico

- **Memória de glossário** — nomes próprios e termos de domínio ficam consistentes na conversa inteira.
- **Voz por falante** — cada idioma usa uma voz distinta (efeito de duas pessoas).
- **Contexto de conversa** — cada tradução considera os turnos anteriores.
- **Guarda de eco** — o microfone pausa durante a fala traduzida (sem loop).
- **Resumo bilíngue** — gere um recap da conversa e compartilhe.
- **Sessão persistente** — par de idiomas, histórico e glossário sobrevivem ao refresh.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencher OPENAI_API_KEY
npm run dev
```

Abrir http://localhost:3000. O microfone do navegador exige `localhost` ou HTTPS.

## Testes

```bash
npm test
```

## Deploy (Vercel)

- **Root Directory** = `web`
- Variável de ambiente `OPENAI_API_KEY`
- HTTPS automático (necessário para o microfone no celular)
