# AI Providers

CareerBridge uses one shared provider fallback chain for CV analysis, CV adaptation, job matching, cover letters, company discovery, and smart search.

Fallback order:

1. Gemini
2. OpenAI
3. DeepSeek
4. Groq
5. OpenRouter
6. Anthropic
7. Hugging Face
8. AI Sweden
9. Ollama local

Optional providers can be missing. The app should only stop when required app infrastructure variables are missing, such as Supabase or database connection variables.

For Swedish or mixed-language requests, configured AI Sweden and Hugging Face providers move to the front of the automatic chain. An explicit `AI_PROVIDER` override still remains first.

## Configure

Use `webapp/.env.local` for real local webapp secrets. Keep `webapp/.env.example` as a public template only.

On Windows PowerShell:

```powershell
Copy-Item webapp\.env.example webapp\.env.local
npm run check:env
npm run check:apis
```

On macOS/Linux:

```bash
cp webapp/.env.example webapp/.env.local
npm run check:env
npm run check:apis
```

Set one preferred provider with `AI_PROVIDER`. If it is empty, CareerBridge tries the fallback order automatically. If you set it to a provider that is missing or out of quota, the app will try that provider first, then fall back to the rest.

Example local setup:

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=your-real-key-here
GEMINI_MODEL=gemini-2.0-flash

OPENAI_API_KEY=your-real-key-here
OPENAI_MODEL=gpt-4o-mini
```

For this workspace, your local files already have Gemini and OpenAI configured in `webapp/.env.local`. Both keys are read correctly, but the latest health check reported provider quota exceeded. When quota is available again, rerun:

```bash
npm run check:apis
```

Then restart the dev server so Next.js reloads env vars:

```bash
npm run dev
```

Never commit `.env`, `.env.local`, or real API keys. The diagnostics scripts mask key values and only print provider status.

## Provider Keys

| Provider | Env vars | Notes |
| --- | --- | --- |
| Gemini | `GEMINI_API_KEY`, `GEMINI_MODEL` | Free-tier friendly. Default model is `gemini-2.0-flash`. Get a key from Google AI Studio: https://aistudio.google.com/apikey |
| OpenAI | `OPENAI_API_KEY`, `OPENAI_MODEL` | Cheap default in code is `gpt-4o-mini` if no model is set. Keys: https://platform.openai.com/api-keys |
| DeepSeek | `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `DEEPSEEK_BASE_URL` | OpenAI-compatible chat completions. Default base URL: `https://api.deepseek.com/v1`. Docs: https://api-docs.deepseek.com/ |
| Groq | `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_BASE_URL` | OpenAI-compatible and fast. Default base URL: `https://api.groq.com/openai/v1`. Console: https://console.groq.com/ |
| OpenRouter | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_BASE_URL` | Routes to many models. Default base URL: `https://openrouter.ai/api/v1`. Keys: https://openrouter.ai/settings/keys |
| Anthropic | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Default in code is `claude-3-5-haiku-latest` if no model is set. Keys: https://console.anthropic.com/settings/keys |
| Hugging Face | `HUGGINGFACE_API_KEY`, `HUGGINGFACE_BASE_URL`, `HUGGINGFACE_MODEL` | Default base URL: `https://api-inference.huggingface.co`. `HUGGINGFACE_API_TOKEN` is still accepted as a legacy alias. Tokens: https://huggingface.co/settings/tokens |
| AI Sweden | `AI_SWEDEN_API_KEY`, `AI_SWEDEN_MODEL`, `AI_SWEDEN_BASE_URL` | Uses an inference endpoint for GPT-SW3-compatible text generation. `AI_SWEDEN_MODEL=gpt-sw3` maps to the default GPT-SW3 instruct model. Legacy aliases `GPT_SW3_MODEL` and `GPT_SW3_ENDPOINT` still work. |
| Ollama | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Local provider. Default URL is `http://localhost:11434`, model `llama3.1`. |

## Health Checks

Run:

```bash
npm run check:env
npm run check:apis
npm run check:integrations
npm run test:ai
```

`check:apis` skips missing providers and sends a tiny live request to configured providers. Status values are:

`check:integrations` runs the provider checks and also verifies the Arbetsförmedlingen JobSearch API, JobTech Taxonomy API, and configured Swedish career-page catalogs.

- `working`
- `missing key`
- `invalid key`
- `quota exceeded`
- `timeout`
- `server offline`
- `skipped`
- `unknown error`

The web UI at `/settings/ai-providers` shows the same safe diagnostics: provider name, configured/missing state, current model, last checked time, last error, and retry buttons. It never returns API keys.

## Ollama Local

Install Ollama from https://ollama.com, then run:

```bash
ollama pull llama3.1
ollama serve
```

Set:

```bash
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
```

If `check:apis` reports `server offline`, make sure the Ollama app or `ollama serve` is running and that the model has been pulled.

## 429 and Quota Troubleshooting

429 means a provider rejected the request because of rate limits, quota, billing, or credits.

- Wait a few minutes and retry from `/settings/ai-providers`.
- Add another provider key so fallback can continue.
- Prefer Gemini, Groq, DeepSeek, or a small OpenRouter model for cheap/free backup capacity.
- For OpenAI or Anthropic, check billing and usage limits in the provider console.
- For Gemini free tier, keep requests small and retry after rate limits cool down.

If every provider fails, CV generation falls back to a local template-based draft instead of saving broken AI output.
