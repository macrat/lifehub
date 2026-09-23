-- 既存の終日の項目の通知を日単位に寄せる（0 分前は当日、それ以外は前日）。制約を足す前に行う
UPDATE "events" SET
	"remind_start_minutes" = CASE WHEN "remind_start_minutes" IS NULL OR "remind_start_minutes" = 0 THEN "remind_start_minutes" ELSE 1440 END,
	"remind_end_minutes" = CASE WHEN "remind_end_minutes" IS NULL OR "remind_end_minutes" = 0 THEN "remind_end_minutes" ELSE 1440 END
WHERE "all_day";--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_all_day_remind_check" CHECK (not "events"."all_day" or (coalesce("events"."remind_start_minutes", 0) in (0, 1440) and coalesce("events"."remind_end_minutes", 0) in (0, 1440)));