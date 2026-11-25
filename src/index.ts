import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/node-postgres';
import { desc, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { parseEnv } from '@neon/env';
import config from '../neon';
import { usageLog } from './db/schema';

// Full env resolution so the runtime wires the Postgres URL and the AI gateway
// credentials (NEON_AI_GATEWAY_TOKEN / NEON_AI_GATEWAY_BASE_URL) into the process.
const env = parseEnv(config);

const pool = new Pool({ connectionString: env.postgres.databaseUrl, max: 5 });
const db = drizzle(pool);

// The gateway is OpenAI-compatible. One base URL and one token reach every model.
const GATEWAY_URL = `${process.env.NEON_AI_GATEWAY_BASE_URL}/ai-gateway/mlflow/v1/chat/completions`;
const GATEWAY_TOKEN = process.env.NEON_AI_GATEWAY_TOKEN;

// A curated slice of the catalog across three providers, reached with the SAME
// credential. The gateway exposes ~25 models; these are cheap ones to demo with.
const MODELS = [
  { id: 'gpt-6-luna', provider: 'openai' },
  { id: 'gpt-oss-20b', provider: 'openai' },
  { id: 'claude-haiku-4-5', provider: 'anthropic' },
  { id: 'gemini-2-5-flash', provider: 'google' },
];

// Token-limit parameter differs by family: GPT-5 and newer GPT models want max_completion_tokens
// (and enough of it, since they spend tokens reasoning), everything else wants
// max_tokens. Normalizing this here is what lets a caller swap models freely.
function tokenLimit(model: string, maxTokens: number) {
  return /^gpt-\d/.test(model)
    ? { max_completion_tokens: maxTokens }
    : { max_tokens: maxTokens };
}

interface GatewayResult {
  ok: boolean;
  status: number;
  content?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  error?: string;
}

async function callGateway(model: string, prompt: string, maxTokens: number): Promise<GatewayResult> {
  const res = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${GATEWAY_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      ...tokenLimit(model, maxTokens),
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json as { error?: { message?: string } }).error?.message ?? JSON.stringify(json);
    return { ok: false, status: res.status, error: err };
  }
  const choice = (json as { choices?: { message?: { content?: string } }[] }).choices?.[0];
  return {
    ok: true,
    status: res.status,
    content: choice?.message?.content ?? '',
    usage: (json as { usage?: GatewayResult['usage'] }).usage,
  };
}

const app = new Hono();

app.get('/', (c) =>
  c.text('Neon AI gateway demo — POST /chat { model | models, prompt }, GET /models, GET /usage'),
);

app.get('/models', (c) => c.json(MODELS));

// One credential, any model. Pass `model` for a single call, or `models` (an
// ordered list) to fall back to the next one if a provider errors or is down.
app.post('/chat', async (c) => {
  const body = await c.req.json<{
    model?: string;
    models?: string[];
    prompt: string;
    maxTokens?: number;
  }>();
  const prompt = body.prompt ?? 'Say hello in one short sentence.';
  const maxTokens = body.maxTokens ?? 512;
  const chain = body.models ?? [body.model ?? 'gpt-6-luna'];

  const tried: { model: string; status: number; error?: string }[] = [];
  for (const model of chain) {
    const result = await callGateway(model, prompt, maxTokens);
    tried.push({ model, status: result.status, error: result.error });
    if (result.ok) {
      await db.insert(usageLog).values({
        model,
        promptTokens: result.usage?.prompt_tokens ?? 0,
        completionTokens: result.usage?.completion_tokens ?? 0,
        totalTokens: result.usage?.total_tokens ?? 0,
      });
      return c.json({ model, content: result.content, usage: result.usage, tried });
    }
  }
  return c.json({ error: 'all models failed', tried }, 502);
});

// Per-branch spend view: tokens grouped by model, from this branch's log.
app.get('/usage', async (c) => {
  const rows = await db
    .select({
      model: usageLog.model,
      calls: sql<number>`count(*)::int`,
      totalTokens: sql<number>`sum(${usageLog.totalTokens})::int`,
    })
    .from(usageLog)
    .groupBy(usageLog.model)
    .orderBy(desc(sql`sum(${usageLog.totalTokens})`));
  return c.json(rows);
});

export default app;
