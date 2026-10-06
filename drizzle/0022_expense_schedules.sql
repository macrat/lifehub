CREATE TABLE "expense_schedules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"from_user_id" uuid,
	"to_user_id" uuid,
	"amount" integer NOT NULL,
	"description" text NOT NULL,
	"starts_on" date NOT NULL,
	"frequency" text NOT NULL,
	"generated_through" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "expense_schedules_parties_check" CHECK (num_nonnulls("expense_schedules"."from_user_id", "expense_schedules"."to_user_id") > 0),
	CONSTRAINT "expense_schedules_frequency_check" CHECK ("expense_schedules"."frequency" in ('daily', 'weekly', 'monthly', 'yearly'))
);
--> statement-breakpoint
ALTER TABLE "expense_schedules" ADD CONSTRAINT "expense_schedules_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_schedules" ADD CONSTRAINT "expense_schedules_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_schedules" ADD CONSTRAINT "expense_schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;