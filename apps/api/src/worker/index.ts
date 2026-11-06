import { startUsageEventsWorker } from "./usage-events-worker.js";

const worker = startUsageEventsWorker();
console.log("usage-events worker started");

process.on("SIGTERM", async () => {
  await worker.close();
  process.exit(0);
});
