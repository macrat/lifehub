CREATE TABLE "money_accounts" (
	"name" text PRIMARY KEY NOT NULL,
	"balance" integer,
	"withdrawal_amount" integer,
	"withdrawal_on" date,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "money_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"account" text NOT NULL,
	"occurred_on" date NOT NULL,
	"description" text NOT NULL,
	"amount" integer NOT NULL,
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "money_transactions_source_id_unique" UNIQUE("source_id")
);
