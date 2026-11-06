import type { UsageEventInput } from "@llmlens/shared-types";
import { createRng, pickWeighted, randomInRange, randomIntInRange } from "./prng.js";
import {
  FEATURE_TAGS,
  MODEL_PROFILES,
  UNPRICED_MODEL,
  UNPRICED_MODEL_PROBABILITY,
  type ModelProfile,
} from "./model-profiles.js";

export interface GeneratorConfig {
  from: Date;
  to: Date;
  seed?: number;
  /** expected events per hour at peak business-hours traffic, at the end of the range */
  peakEventsPerHour?: number;
  /** number of random incident windows (elevated errors + latency) to scatter across the range */
  incidentCount?: number;
}

interface IncidentWindow {
  startMs: number;
  endMs: number;
}

function hourlySeasonalityFactor(date: Date): number {
  const hour = date.getUTCHours();
  const day = date.getUTCDay(); // 0 = Sunday
  const isWeekend = day === 0 || day === 6;
  // bell-ish curve peaking around 10am-4pm UTC
  const hourFactor = Math.max(0.08, Math.exp(-((hour - 13) ** 2) / 30));
  const weekendFactor = isWeekend ? 0.35 : 1.0;
  return hourFactor * weekendFactor;
}

function modelWeightAt(profile: ModelProfile, fraction: number): number {
  return profile.earlyWeight + (profile.lateWeight - profile.earlyWeight) * fraction;
}

function buildIncidentWindows(
  rng: () => number,
  from: Date,
  to: Date,
  count: number,
): IncidentWindow[] {
  const totalMs = to.getTime() - from.getTime();
  const windows: IncidentWindow[] = [];
  for (let i = 0; i < count; i++) {
    const startMs = from.getTime() + rng() * totalMs;
    const durationMs = randomInRange(rng, 1, 3) * 60 * 60 * 1000;
    windows.push({ startMs, endMs: startMs + durationMs });
  }
  return windows;
}

function isDuringIncident(timeMs: number, windows: IncidentWindow[]): boolean {
  return windows.some((w) => timeMs >= w.startMs && timeMs <= w.endMs);
}

/**
 * Lazily yields synthetic usage events across [from, to]. Memory stays flat
 * regardless of range size — consumers decide whether to materialize,
 * stream to HTTP, or stream to a DB insert.
 */
export function* generateEvents(config: GeneratorConfig): Generator<UsageEventInput> {
  const { from, to } = config;
  const peakEventsPerHour = config.peakEventsPerHour ?? 40;
  const incidentCount = config.incidentCount ?? 4;
  const rng = createRng(config.seed ?? 42);
  const totalMs = to.getTime() - from.getTime();
  const incidents = buildIncidentWindows(rng, from, to, incidentCount);

  for (let hourStart = from.getTime(); hourStart < to.getTime(); hourStart += 3600_000) {
    const hourDate = new Date(hourStart);
    const fraction = (hourStart - from.getTime()) / totalMs; // 0 at `from`, ~1 at `to`
    const growthTrend = 0.35 + 0.65 * fraction; // adoption ramp over the range
    const seasonality = hourlySeasonalityFactor(hourDate);
    const expected = peakEventsPerHour * seasonality * growthTrend;
    // Not a true Poisson draw — a cheap approximation (expected value with
    // +/-30% jitter) that's good enough for a synthetic demo dataset.
    const eventCount = Math.max(0, Math.round(expected * randomInRange(rng, 0.7, 1.3)));

    for (let i = 0; i < eventCount; i++) {
      const occurredAtMs = hourStart + rng() * 3600_000;
      const duringIncident = isDuringIncident(occurredAtMs, incidents);

      const useUnpriced = rng() < UNPRICED_MODEL_PROBABILITY;
      const profile = useUnpriced
        ? null
        : pickWeighted(
            rng,
            MODEL_PROFILES.map((p) => ({ value: p, weight: modelWeightAt(p, fraction) })),
          );

      const provider = profile?.provider ?? UNPRICED_MODEL.provider;
      const model = profile?.model ?? UNPRICED_MODEL.model;
      const promptRange = profile?.promptTokenRange ?? UNPRICED_MODEL.promptTokenRange;
      const completionRange = profile?.completionTokenRange ?? UNPRICED_MODEL.completionTokenRange;
      const latencyRange = profile?.baseLatencyMs ?? UNPRICED_MODEL.baseLatencyMs;

      const errorProbability = duringIncident ? 0.3 : 0.015;
      const isError = rng() < errorProbability;
      const latencyMultiplier = duringIncident ? randomInRange(rng, 2, 3.5) : 1;

      const promptTokens = randomIntInRange(rng, ...promptRange);
      const completionTokens = isError
        ? randomIntInRange(rng, 0, Math.floor(completionRange[0] / 2))
        : randomIntInRange(rng, ...completionRange);

      yield {
        occurredAt: new Date(occurredAtMs).toISOString(),
        provider,
        model,
        operation: provider === "openai" ? "chat.completions" : "messages",
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        latencyMs: Math.round(randomInRange(rng, ...latencyRange) * latencyMultiplier),
        status: isError ? "error" : "success",
        errorType: isError ? pickWeighted(rng, [
          { value: "rate_limit", weight: 3 },
          { value: "timeout", weight: 2 },
          { value: "server_error", weight: 1 },
        ]) : undefined,
        tags: { feature: pickWeighted(rng, FEATURE_TAGS.map((t) => ({ value: t, weight: 1 }))) },
      };
    }
  }
}
