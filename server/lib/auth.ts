import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
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
 */
export const auth = betterAuth({
  baseURL: resolveBaseUrl(),
  basePath: '/api/auth',
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    autoSignIn: false,
  },
  disabledPaths: ['/sign-up/email'],
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
