import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type { BetterAuthOptions } from 'better-auth';
import { and, lte, ne, sql } from 'drizzle-orm';
import { db } from './client.ts';
import * as schema from './schema.ts';

const { rateLimits } = schema;

/**
 * better-auth が読み書きする表（ユーザー・セッション・OAuth）。表の定義は各 feature の schema と
 * oauth-schema.ts にあり、better-auth のモデル名との対応をここに置く（DB に触れるのは lib/db だけ）。
 */
export const authDatabase = drizzleAdapter(db, {
  provider: 'pg',
  schema: {
    user: schema.users,
    session: schema.sessions,
    account: schema.accounts,
    verification: schema.verifications,
    jwks: schema.jwks,
    oauthClient: schema.oauthClients,
    oauthResource: schema.oauthResources,
    oauthClientResource: schema.oauthClientResources,
    oauthRefreshToken: schema.oauthRefreshTokens,
    oauthAccessToken: schema.oauthAccessTokens,
    oauthConsent: schema.oauthConsents,
    oauthClientAssertion: schema.oauthClientAssertions,
  },
});

type RateLimitStorage = NonNullable<NonNullable<BetterAuthOptions['rateLimit']>['customStorage']>;

/**
 * better-auth のレート制限の数えを `rate_limits` に置く（`server/lib/auth.ts` の `rateLimit`）。
 * 窓の判定・数えの加算・期限を過ぎたほかの行の削除を 1 文にまとめ、ログインのたびの DB の往復を 1 回にする。
 * 同じ IP からの同時の要求も、`on conflict` で 1 行ずつ順に数えるので、すり抜けない。
 *
 * WHY NOT better-auth の `storage: 'database'`: 読んでから書くので、ログインのたびに往復が 2 回になる
 * （Neon の HTTP ドライバでは 1 回が HTTP の往復 1 回）。
 * WHY 期限を過ぎた行を同じ文で消す: 消すための往復を増やさない。普段は行が数行しかないので、消す手間も無いに等しい。
 */
export const rateLimitStorage: RateLimitStorage = {
  async consume(key, { window, max }) {
    const expired = db.$with('expired').as(
      db
        .delete(rateLimits)
        .where(and(lte(rateLimits.resetAt, sql`now()`), ne(rateLimits.key, key)))
        .returning({ key: rateLimits.key }),
    );
    const windowClosed = sql`${rateLimits.resetAt} <= now()`;
    const [row] = await db
      .with(expired)
      .insert(rateLimits)
      .values({ key, count: 1, resetAt: sql`now() + make_interval(secs => ${window})` })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          count: sql`case when ${windowClosed} then 1 else ${rateLimits.count} + 1 end`,
          resetAt: sql`case when ${windowClosed} then excluded.reset_at else ${rateLimits.resetAt} end`,
        },
      })
      .returning({
        count: rateLimits.count,
        retryAfter: sql<number>`ceil(extract(epoch from ${rateLimits.resetAt} - now()))::int`,
      });
    if (!row) throw new Error('rate_limits の数えが返らなかった');
    return row.count <= max
      ? { allowed: true, retryAfter: null }
      : { allowed: false, retryAfter: row.retryAfter };
  },
};
