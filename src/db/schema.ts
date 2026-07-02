import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core';

// Every model call is logged here. Because the table lives on the branch, the
// spend recorded against a preview or CI branch stays isolated from production.
export const usageLog = pgTable('usage_log', {
  id: serial('id').primaryKey(),
  model: text('model').notNull(),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  totalTokens: integer('total_tokens').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
