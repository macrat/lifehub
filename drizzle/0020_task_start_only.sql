-- タスクの期限（ends_at）を廃止し、開始（starts_at）を必須にする。制約を変える前に既存の行を寄せる。
-- 開始の無い繰り返しのタスクは期限が基準日時（DTSTART）だったので、期限の日時（終日なら期限日）を開始にして
-- 繰り返しの並びを保ち、期限前の通知を開始前の通知に移す。終日では基準日時が期限の翌日 0:00 から期限日の 0:00 へ
-- 1 日戻るので、回の照合キー（occurrence_start）も 1 日戻す。ずらす間に一意索引が途中の重なりで止まらないよう、
-- 索引は外してから作り直す。
DROP INDEX "events_series_occurrence_uq";--> statement-breakpoint
UPDATE "events" AS "occurrence" SET "occurrence_start" = "occurrence"."occurrence_start" - interval '1 day'
FROM "events" AS "master"
WHERE "occurrence"."series_id" = "master"."id"
	AND "master"."kind" = 'task' AND "master"."starts_at" IS NULL AND "master"."all_day";--> statement-breakpoint
CREATE UNIQUE INDEX "events_series_occurrence_uq" ON "events" USING btree ("series_id","occurrence_start");--> statement-breakpoint
UPDATE "events" SET
	"starts_at" = CASE
		WHEN "ends_at" IS NULL THEN "occurrence_start"
		WHEN "all_day" THEN "ends_at" - interval '1 day'
		ELSE "ends_at"
	END,
	"remind_start_minutes" = "remind_end_minutes"
WHERE "kind" = 'task' AND "starts_at" IS NULL AND ("rrule" IS NOT NULL OR "series_id" IS NOT NULL);--> statement-breakpoint
-- 繰り返さない開始の無いタスクは、登録した日（JST）の終日にする（新しく作るタスクの既定と同じ）
UPDATE "events" SET
	"starts_at" = date_trunc('day', "created_at" AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo',
	"all_day" = true,
	"remind_start_minutes" = NULL,
	"ends_at" = NULL,
	"remind_end_minutes" = NULL
WHERE "kind" = 'task' AND "starts_at" IS NULL;--> statement-breakpoint
UPDATE "events" SET "ends_at" = NULL, "remind_end_minutes" = NULL WHERE "kind" = 'task';--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_event_has_range_check";--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_recurring_has_base_check";--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "starts_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_end_only_event_check" CHECK (("events"."kind" = 'event') = ("events"."ends_at" is not null));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_remind_end_only_event_check" CHECK ("events"."kind" = 'event' or "events"."remind_end_minutes" is null);
