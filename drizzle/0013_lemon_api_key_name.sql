ALTER TABLE "lemon_care_logs" ADD COLUMN "api_key_name" text;--> statement-breakpoint
-- 名前を残す前に API キーで入れた記録は、どのキーか分からないので総称にする
UPDATE "lemon_care_logs" SET "api_key_name" = 'API キー' WHERE "created_by" IS NULL;--> statement-breakpoint
ALTER TABLE "lemon_care_logs" ADD CONSTRAINT "lemon_care_logs_source_check" CHECK (num_nonnulls("lemon_care_logs"."created_by", "lemon_care_logs"."api_key_name") = 1);