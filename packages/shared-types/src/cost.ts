export function calculateCostUsd(
  pricing: { inputPricePer1k: string; outputPricePer1k: string } | null,
  promptTokens: number,
  completionTokens: number,
): number {
  if (!pricing) return 0;
  const inputCost = (promptTokens / 1000) * Number(pricing.inputPricePer1k);
  const outputCost = (completionTokens / 1000) * Number(pricing.outputPricePer1k);
  return inputCost + outputCost;
}
