ALTER TABLE "usage_events" ALTER COLUMN "cost_usd" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "usage_events" ALTER COLUMN "cost_usd" DROP NOT NULL;