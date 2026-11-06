import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

// BullMQ requires maxRetriesPerRequest: null on the connection it manages.
export function createRedisConnection() {
  return new Redis(redisUrl, { maxRetriesPerRequest: null });
}
