CREATE TABLE "calendar_feed_participants" (
	"feed_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "calendar_feed_participants_feed_id_user_id_pk" PRIMARY KEY("feed_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "calendar_feed_participants" ADD CONSTRAINT "calendar_feed_participants_feed_id_calendar_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."calendar_feeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_feed_participants" ADD CONSTRAINT "calendar_feed_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- 既にある配信 URL には全ユーザーを載せる（参加者で絞る前と同じものが配られ続ける）
INSERT INTO "calendar_feed_participants" ("feed_id", "user_id")
SELECT "calendar_feeds"."id", "users"."id" FROM "calendar_feeds" CROSS JOIN "users";
