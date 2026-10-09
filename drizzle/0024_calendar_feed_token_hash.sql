-- 配信 URL のトークンをハッシュに置き換える（server/lib/secret.ts の hashSecret と同じ、SHA-256 の base64url）。
-- 既存の URL はそのまま使える。
ALTER TABLE "calendar_feeds" RENAME COLUMN "token" TO "token_hash";--> statement-breakpoint
ALTER TABLE "calendar_feeds" RENAME CONSTRAINT "calendar_feeds_token_unique" TO "calendar_feeds_token_hash_unique";--> statement-breakpoint
UPDATE "calendar_feeds" SET "token_hash" = rtrim(translate(encode(sha256(convert_to("token_hash", 'UTF8')), 'base64'), '+/', '-_'), '=');
