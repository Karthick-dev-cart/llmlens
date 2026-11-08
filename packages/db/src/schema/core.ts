import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const orgMembers = pgTable("org_members", {
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  userId: text("user_id").notNull(),
  role: text("role").notNull().default("member"),
});

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const modelPricing = pgTable("model_pricing", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  inputPricePer1k: numeric("input_price_per_1k", { precision: 12, scale: 8 }).notNull(),
  outputPricePer1k: numeric("output_price_per_1k", { precision: 12, scale: 8 }).notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
});

// NOTE: converted to a Timescale hypertable via a raw-SQL migration step
// (drizzle-kit can't express `create_hypertable`), partitioned on occurredAt.
export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").defaultRandom().notNull(),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    operation: text("operation").notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    // NULL means "no pricing found for this provider/model at this time" —
    // deliberately distinct from a genuine $0 cost, so SUM(cost_usd) in the
    // rollups doesn't silently treat unpriced usage as free.
    costUsd: numeric("cost_usd", { precision: 12, scale: 8 }),
    latencyMs: integer("latency_ms"),
    status: text("status").notNull(),
    errorType: text("error_type"),
    tags: jsonb("tags").$type<Record<string, string>>().default({}),
    requestId: text("request_id"),
    userIdentifier: text("user_identifier"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("usage_events_project_time_idx").on(table.projectId, table.occurredAt),
  ],
);

export const budgets = pgTable("budgets", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  period: text("period").notNull(), // "daily" | "monthly"
  thresholdUsd: numeric("threshold_usd", { precision: 12, scale: 2 }).notNull(),
  channelConfig: jsonb("channel_config").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const alertEvents = pgTable("alert_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Cascade: alert history has no independent meaning once its budget
  // (which carries the period/threshold context) is gone.
  budgetId: uuid("budget_id")
    .notNull()
    .references(() => budgets.id, { onDelete: "cascade" }),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).defaultNow().notNull(),
  valueAtTrigger: numeric("value_at_trigger", { precision: 12, scale: 2 }).notNull(),
  acknowledged: timestamp("acknowledged_at", { withTimezone: true }),
});
