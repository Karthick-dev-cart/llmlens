import Fastify from "fastify";
import cors from "@fastify/cors";
import { ingestRoutes } from "./routes/ingest/index.js";
import { authRoutes } from "./routes/auth/index.js";
import { projectRoutes } from "./routes/projects/index.js";
import { metricsRoutes } from "./routes/metrics/index.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(ingestRoutes);
await app.register(authRoutes);
await app.register(projectRoutes);
await app.register(metricsRoutes);

app.get("/health", async () => ({ status: "ok", service: "llmlens-api" }));

const port = Number(process.env.PORT ?? 3001);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
