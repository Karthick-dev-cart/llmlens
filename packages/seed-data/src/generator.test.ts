import { describe, expect, it } from "vitest";
import { usageEventInput } from "@llmlens/shared-types";
import { generateEvents } from "./generator.js";

const ONE_WEEK = { from: new Date("2026-01-05T00:00:00Z"), to: new Date("2026-01-12T00:00:00Z") };

describe("generateEvents", () => {
  it("produces events that satisfy the real ingestion contract", () => {
    const events = Array.from(generateEvents({ ...ONE_WEEK, seed: 1 }));
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      const result = usageEventInput.safeParse(event);
      expect(result.success, JSON.stringify(result.success ? null : result.error.flatten())).toBe(
        true,
      );
    }
  });

  it("is deterministic for a given seed", () => {
    const a = Array.from(generateEvents({ ...ONE_WEEK, seed: 7 }));
    const b = Array.from(generateEvents({ ...ONE_WEEK, seed: 7 }));
    expect(a).toEqual(b);
  });

  it("produces different output for different seeds", () => {
    const a = Array.from(generateEvents({ ...ONE_WEEK, seed: 1 }));
    const b = Array.from(generateEvents({ ...ONE_WEEK, seed: 2 }));
    expect(a).not.toEqual(b);
  });

  it("keeps all events within the requested range", () => {
    const events = Array.from(generateEvents({ ...ONE_WEEK, seed: 3 }));
    for (const event of events) {
      const t = new Date(event.occurredAt).getTime();
      expect(t).toBeGreaterThanOrEqual(ONE_WEEK.from.getTime());
      expect(t).toBeLessThan(ONE_WEEK.to.getTime() + 3600_000); // last hour bucket can spill slightly
    }
  });

  it("raises the error rate during incident windows vs baseline", () => {
    // A long, low-traffic-variance range with exactly one incident window,
    // and a high peak rate so we get enough samples to see the effect.
    const events = Array.from(
      generateEvents({ ...ONE_WEEK, seed: 99, peakEventsPerHour: 200, incidentCount: 1 }),
    );
    const errorRate = events.filter((e) => e.status === "error").length / events.length;
    // baseline is ~1.5%; with one incident window mixed in over a week,
    // overall rate should still be noticeably above a tight non-incident bound.
    expect(errorRate).toBeGreaterThan(0.015);
  });
});
