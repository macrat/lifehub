import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { mcp } from '@better-auth/mcp';
import { betterAuth } from 'better-auth';
import { jwt } from 'better-auth/plugins';
import { v7 as uuidv7 } from 'uuid';
import { PASSWORD_MIN_LENGTH } from '../../shared/constants.ts';
import { db } from './db.ts';
import { env, resolveBaseUrl } from './env.ts';
import * as schema from './schema.ts';

/**
 * better-auth の設定（メール＋パスワード、Drizzle アダプタ）。
 *
 * - 公開のサインアップ経路は disabledPaths で閉じる。ユーザー作成は users service（サーバー内部から
 *   auth.api.signUpEmail を呼ぶ）と scripts/create-user.ts だけが行う。
 *   `emailAndPassword.disableSignUp` は内部呼び出しも拒否するため使わない。
 * - ID は全テーブル共通規約に合わせて UUID v7 を生成する。
 * - MCP 向けに LifeHub 自身を OAuth 2.1 認可サーバーにする（@better-auth/mcp = oauth-provider の MCP 向け設定）。
 *   アクセストークンは JWT（jwt プラグイン）。クライアントの識別は Client ID Metadata Documents（cimd）と
 *   Dynamic Client Registration の両方を受け付ける。
 */
const baseUrl = resolveBaseUrl();
export const MCP_RESOURCE = `${baseUrl}/api/mcp`;
export const auth = betterAuth({
  baseURL: baseUrl,
  basePath: '/api/auth',
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
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
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    autoSignIn: false,
  },
  // /token は jwt プラグインのセッション → JWT 交換。OAuth プロバイダとして動くときは閉じる（公式の推奨）
  disabledPaths: ['/sign-up/email', '/token'],
  plugins: [
    jwt({ disableSettingJwtHeader: true }),
    mcp({
      loginPage: '/login',
      consentPage: '/consent',
      resource: MCP_RESOURCE,
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
    }),
    cimd({ fetchClientMetadataResource, metadataProfile: 'mcp-2026-07-28' }),
  ],
  advanced: {
    database: {
      generateId: () => uuidv7(),
    },
  },
  session: {
    // 2 人がヘビーに使う端末なので、ログイン状態は長く保つ
    expiresIn: 60 * 60 * 24 * 90,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
export type AuthUser = AuthSession['user'];
