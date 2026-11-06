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
