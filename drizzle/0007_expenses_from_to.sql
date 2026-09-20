ALTER TABLE "expenses" RENAME COLUMN "paid_by" TO "from_user_id";--> statement-breakpoint
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_paid_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "to_user_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "expenses" ("id", "from_user_id", "to_user_id", "amount", "description", "spent_on", "created_at", "updated_at", "created_by")
SELECT "id", "from_user", "to_user", "amount", '精算', "settled_on", "created_at", "updated_at", "created_by" FROM "settlements";--> statement-breakpoint
ALTER TABLE "settlements" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "settlements" CASCADE;
