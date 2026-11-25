# Neon AI gateway demo — one credential, any model

> Companion repo for the DevOps Daily posts on the Neon AI gateway: **[One Key for Claude, GPT, and Gemini](https://devops-daily.com/posts/neon-one-key-for-claude-gpt-gemini)** and the rest of the AI-gateway series.

A [Neon Function](https://neon.com) that calls large language models through the Neon AI gateway. One injected credential reaches every provider (OpenAI, Anthropic, Google) over an OpenAI-compatible endpoint, so there is no per-provider SDK and no key sprawl. Each call's token usage is logged to Postgres, and because that table lives on the branch, a preview or CI branch's spend stays isolated from production.

## Endpoints

| Method + path | What it does |
| --- | --- |
| `POST /chat` | `{ model, prompt }` calls one model. `{ models: [...], prompt }` tries each in order and falls back on error. Logs usage. |
| `GET /models` | The curated model list this demo uses (a slice of the ~25 the gateway exposes). |
| `GET /usage` | Tokens grouped by model, from this branch's usage log. |

## How it works

The gateway is OpenAI-compatible. The function POSTs to `${NEON_AI_GATEWAY_BASE_URL}/ai-gateway/mlflow/v1/chat/completions` with `Authorization: Bearer ${NEON_AI_GATEWAY_TOKEN}` and a `model` field. Both variables are injected by `neon deploy` when `aiGateway: true` is set in `neon.ts`.

> **Token-limit gotcha.** GPT-5 and newer GPT models want `max_completion_tokens` (and enough of it, since they spend tokens reasoning); other models want `max_tokens`. `gpt-oss-*` rejects `max_completion_tokens` outright. `src/index.ts` normalizes this per model family, which is what lets a caller swap models freely.

Model IDs use dashes, not dots: `gemini-2-5-flash`, not `gemini-2.5-flash`.

## Run it

```bash
npm install
neon link            # create/link a Neon project
npm run db:push      # create the usage_log table
neon deploy          # deploy the function; injects the gateway credential

# then, against the printed function URL:
curl -X POST "$URL/chat" -d '{"model":"claude-haiku-4-5","prompt":"Name the capital of France."}'
curl -X POST "$URL/chat" -d '{"models":["not-a-real-model","gpt-6-luna"],"prompt":"hi"}'  # fallback
curl "$URL/usage"
```

Test with cheap models (`gpt-6-luna`, `gpt-oss-20b`, `claude-haiku-4-5`, `gemini-2-5-flash`) and short prompts to keep spend to cents.

## Per-branch spend

Because the usage log is on the branch, each preview or CI branch records only its own model spend:

```bash
neon branches create --name pr-preview
neon deploy --branch pr-preview
# calls made against the branch URL log to the branch; GET /usage on the branch
# shows only the branch's tokens, main is untouched
```

## Model retirement (updated 25 November 2026)

OpenAI ends API access to GPT-5, GPT-5 mini, GPT-5 nano, GPT-5 pro, o3 and o3-pro on 11 December 2026. This demo used `gpt-5-nano`; it now uses `gpt-6-luna` ($0.10 input, $0.50 output per million tokens in the gateway catalog). The recorded runs in the companion posts still show `gpt-5-nano`. The skill files under `.agents/` come from [neondatabase/agent-skills](https://github.com/neondatabase/agent-skills) (pinned in `skills-lock.json`) and may still name older models.
