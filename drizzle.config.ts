import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { parseEnv } from '@neon/env';
import neonConfig from './neon';

loadEnv({ path: '.env.local' });
// Scope to the DB var so parseEnv does not try to resolve the gateway namespace
// (only available after a deploy) during a local db:push.
const env = parseEnv(neonConfig, ['DATABASE_URL']);

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.postgres.databaseUrl,
  },
});
