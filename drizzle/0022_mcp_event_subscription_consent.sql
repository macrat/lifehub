-- 購読を、購読を求めた MCP クライアントへの許可（OAuth の同意）に結び付ける（許可が消えれば購読も消える）。
-- 今ある購読はどの許可のものか分からないので消す。クライアントは refreshBefore より前に購読し直すので、
-- 次の購読し直しで作り直される。
DELETE FROM "mcp_event_subscriptions";
--> statement-breakpoint
ALTER TABLE "mcp_event_subscriptions" ADD COLUMN "consent_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "mcp_event_subscriptions" ADD CONSTRAINT "mcp_event_subscriptions_consent_id_oauth_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."oauth_consents"("id") ON DELETE cascade ON UPDATE no action;
