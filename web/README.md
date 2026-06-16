# TraduzAI Web

Tradução simultânea por voz no navegador do celular. O usuário fala os dois idiomas da conversa, e a partir daí cada fala é traduzida (texto + voz) no idioma do outro, levando o **contexto da conversa** em conta.

Pipeline (tudo OpenAI, em rotas serverless):

```
voz → STT (gpt-4o-transcribe) → tradução com contexto (gpt-4o-mini) → TTS (gpt-4o-mini-tts) → voz
```

Captura hands-free com VAD no browser (`@ricky0123/vad-web`). A chave da OpenAI fica só no servidor.

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
