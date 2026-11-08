ALTER TABLE "alert_events" DROP CONSTRAINT "alert_events_budget_id_budgets_id_fk";
--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;