import { describe, expect, it } from "vitest";
import { calculateCostUsd } from "./cost.js";

describe("calculateCostUsd", () => {
  it("returns 0 when no pricing is found", () => {
    expect(calculateCostUsd(null, 1000, 1000)).toBe(0);
  });

  it("computes input + output cost from per-1k prices", () => {
    const pricing = { inputPricePer1k: "0.0025", outputPricePer1k: "0.01" };
    // 1000 prompt tokens -> 1 * 0.0025, 500 completion tokens -> 0.5 * 0.01
    expect(calculateCostUsd(pricing, 1000, 500)).toBeCloseTo(0.0025 + 0.005, 10);
  });

  it("handles zero tokens", () => {
    const pricing = { inputPricePer1k: "0.0025", outputPricePer1k: "0.01" };
    expect(calculateCostUsd(pricing, 0, 0)).toBe(0);
  });
});
