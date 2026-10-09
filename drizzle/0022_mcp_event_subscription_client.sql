-- 購読を求めた MCP クライアントを持たせる（そのクライアントの失効で一緒に消すため）。
-- 今ある購読はどのクライアントのものか分からないので消す。クライアントは refreshBefore より前に購読し直すので、
-- 次の購読し直しで作り直される。
DELETE FROM "mcp_event_subscriptions";
--> statement-breakpoint
ALTER TABLE "mcp_event_subscriptions" ADD COLUMN "client_id" text NOT NULL;
