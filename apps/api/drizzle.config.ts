import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // points directly at core.ts (not index.ts) to avoid drizzle-kit's
  // esbuild-based loader choking on the NodeNext "./core.js" relative
  // specifier, which only TypeScript (not esbuild) remaps to core.ts
  schema: "./src/db/schema/core.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://llmlens:llmlens@localhost:5433/llmlens",
  },
});
