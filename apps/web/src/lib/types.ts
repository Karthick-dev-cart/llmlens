export interface Project {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

// Shape of POST /v1/projects/:id/api-keys — distinct from ApiKeySummary
// because this is the only response that ever carries the raw secret.
export interface CreatedApiKey {
  rawKey: string;
  prefix: string;
  name: string;
}

export interface MetricsSummary {
  from: string;
  to: string;
  totalCostUsd: number;
  totalTokens: number;
  totalEvents: number;
  totalErrors: number;
}

export interface MetricsTimeseriesPoint {
  date: string;
  costUsd: number;
  tokens: number;
  events: number;
  errors: number;
}

export interface MetricsTimeseries {
  from: string;
  to: string;
  series: MetricsTimeseriesPoint[];
}

export type BreakdownDimension = "model" | "provider" | "status" | "feature";

export interface BreakdownEntry {
  key: string;
  costUsd: number;
  tokens: number;
  events: number;
  errors: number;
}

export interface BreakdownResponse {
  dimension: BreakdownDimension;
  from: string;
  to: string;
  breakdown: BreakdownEntry[];
}

export interface LatencyMetrics {
  from: string;
  to: string;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  avgLatencyMs: number | null;
  sampleCount: number;
}

export interface RawEvent {
  id: string;
  occurredAt: string;
  provider: string;
  model: string;
  operation: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number | null;
  latencyMs: number | null;
  status: string;
  errorType: string | null;
  tags: Record<string, string>;
}

export interface EventsPage {
  events: RawEvent[];
  nextCursor: string | null;
}
