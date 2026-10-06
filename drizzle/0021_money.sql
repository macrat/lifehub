ALTER TABLE "expenses" RENAME TO "money_records";
--> statement-breakpoint
ALTER TABLE "money_records" RENAME COLUMN "spent_on" TO "occurred_on";
--> statement-breakpoint
ALTER INDEX "expenses_pkey" RENAME TO "money_records_pkey";
--> statement-breakpoint
ALTER TABLE "money_records" RENAME CONSTRAINT "expenses_from_user_id_users_id_fk" TO "money_records_from_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "money_records" RENAME CONSTRAINT "expenses_to_user_id_users_id_fk" TO "money_records_to_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "money_records" RENAME CONSTRAINT "expenses_created_by_users_id_fk" TO "money_records_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "money_records" DROP CONSTRAINT "expenses_parties_check";
--> statement-breakpoint
ALTER TABLE "money_records" ALTER COLUMN "created_by" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "money_records" ADD COLUMN "account" text;
--> statement-breakpoint
ALTER TABLE "money_records" ADD COLUMN "source_id" text;
--> statement-breakpoint
ALTER TABLE "money_records" ADD COLUMN "original_description" text;
--> statement-breakpoint
ALTER TABLE "money_records" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "money_records" ADD CONSTRAINT "money_records_source_id_unique" UNIQUE("source_id");
--> statement-breakpoint
ALTER TABLE "money_records" ADD CONSTRAINT "money_records_manual_check" CHECK ("money_records"."account" is not null or (num_nonnulls("money_records"."from_user_id", "money_records"."to_user_id") > 0 and "money_records"."created_by" is not null));
--> statement-breakpoint
ALTER TABLE "money_records" ADD CONSTRAINT "money_records_import_check" CHECK (("money_records"."account" is null) = ("money_records"."source_id" is null) and ("money_records"."account" is null) = ("money_records"."original_description" is null));
--> statement-breakpoint
CREATE TABLE "money_accounts" (
	"name" text PRIMARY KEY NOT NULL,
	"balance" integer,
	"withdrawal_amount" integer,
	"withdrawal_on" date,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "money_balances" (
	"account" text NOT NULL,
	"recorded_on" date NOT NULL,
	"balance" integer NOT NULL,
	CONSTRAINT "money_balances_account_recorded_on_pk" PRIMARY KEY("account","recorded_on")
);
--> statement-breakpoint
CREATE TABLE "money_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"position" integer NOT NULL,
	"pattern" text NOT NULL,
	"replace_description" boolean NOT NULL,
	"replacement" text NOT NULL,
	"kind" text NOT NULL,
	"user_id" uuid,
	"hidden" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "money_rules_kind_check" CHECK ("money_rules"."kind" in ('spending', 'deposit', 'withdrawal') and ("money_rules"."kind" = 'spending') = ("money_rules"."user_id" is null))
);
--> statement-breakpoint
CREATE TABLE "money_schedules" (
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
	CONSTRAINT "money_schedules_parties_check" CHECK (num_nonnulls("money_schedules"."from_user_id", "money_schedules"."to_user_id") > 0),
	CONSTRAINT "money_schedules_frequency_check" CHECK ("money_schedules"."frequency" in ('daily', 'weekly', 'monthly', 'yearly'))
);
--> statement-breakpoint
ALTER TABLE "money_rules" ADD CONSTRAINT "money_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "money_rules" ADD CONSTRAINT "money_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "money_schedules" ADD CONSTRAINT "money_schedules_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "money_schedules" ADD CONSTRAINT "money_schedules_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "money_schedules" ADD CONSTRAINT "money_schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
