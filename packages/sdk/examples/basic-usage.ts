// Run with: OPENAI_API_KEY=sk-... LLMLENS_API_KEY=llk_... tsx examples/basic-usage.ts
// (LLMLENS_API_KEY comes from `pnpm --filter @llmlens/api create-test-key`)
import OpenAI from "openai";
import { wrapOpenAI, shutdownAllCaptures } from "../src/index.js";

const openai = wrapOpenAI(new OpenAI({ apiKey: process.env.OPENAI_API_KEY }), {
  apiKey: process.env.LLMLENS_API_KEY ?? "",
  endpoint: process.env.LLMLENS_API_URL ?? "http://localhost:3001",
  tags: { feature: "examples/basic-usage" },
});

const completion = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Say hello in exactly three words." }],
});

console.log(completion.choices[0]?.message.content);

// Flush immediately instead of waiting up to 2s for the background timer —
// only needed because this script exits right after; a long-running server
// doesn't need this.
await shutdownAllCaptures();
