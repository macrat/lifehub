CREATE TABLE "money_accounts" (
	"name" text PRIMARY KEY NOT NULL,
	"balance" integer,
	"withdrawal_amount" integer,
	"withdrawal_on" date,
	"fetched_at" timestamp with time zone NOT NULL
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
CREATE TABLE "money_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"account" text NOT NULL,
	"occurred_on" date NOT NULL,
	"original_description" text NOT NULL,
	"description" text NOT NULL,
	"amount" integer NOT NULL,
	"direction" text,
	"user_id" uuid,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "money_transactions_source_id_unique" UNIQUE("source_id"),
	CONSTRAINT "money_transactions_party_check" CHECK (("money_transactions"."direction" is null) = ("money_transactions"."user_id" is null) and ("money_transactions"."direction" is null or "money_transactions"."direction" in ('deposit', 'withdrawal')))
);
--> statement-breakpoint
ALTER TABLE "money_rules" ADD CONSTRAINT "money_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_rules" ADD CONSTRAINT "money_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_transactions" ADD CONSTRAINT "money_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;