# AI Provider Setup

CareerBridge can run with multiple AI providers. The automatic fallback order is:

1. OpenAI
2. DeepSeek
3. Groq
4. OpenRouter
5. AI Sweden
6. Hugging Face
7. Ollama local
8. Anthropic

Set keys in `webapp/.env.local`. You only need one working provider, but two or more are recommended for resilience.

```env
OPENAI_API_KEY=
DEEPSEEK_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
AI_SWEDEN_API_KEY=
HUGGINGFACE_API_KEY=
ANTHROPIC_API_KEY=
```

To force a provider, set `AI_PROVIDER=openai`, `deepseek`, `groq`, `openrouter`, `aisweden`, `huggingface`, `ollama`, or `anthropic`.

## Ollama

Install Ollama, start the local server, and pull a model:

```bash
ollama pull llama3.1
```

Then set:

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
```

If `OLLAMA_BASE_URL` is missing, CareerBridge skips Ollama. If it is set but the server is offline, the provider is marked unavailable and the fallback chain continues.

## Diagnostics

Open `/settings/ai-providers` in the web app to see:

- configured or missing providers
- current health status
- response time
- last successful request
- last error
- temporary provider pauses after quota or timeout failures

When all providers fail, CV adaptation falls back to a deterministic local CV draft built from the uploaded CV text. This keeps job browsing and manual editing usable without saving provider error text as a CV.
