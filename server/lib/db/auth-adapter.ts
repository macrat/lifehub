import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { db } from './client.ts';
import * as schema from './schema.ts';

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
    rateLimit: schema.rateLimits,
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
