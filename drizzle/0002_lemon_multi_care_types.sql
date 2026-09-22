ALTER TABLE "lemon_care_logs" ADD COLUMN "care_types" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
UPDATE "lemon_care_logs" SET "care_types" = ARRAY["care_type"] WHERE "care_type" <> 'note';--> statement-breakpoint
ALTER TABLE "lemon_care_logs" ALTER COLUMN "care_types" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "lemon_care_logs" DROP COLUMN "care_type";
