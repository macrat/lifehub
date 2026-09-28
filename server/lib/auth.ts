import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { mcp } from '@better-auth/mcp';
import { type BetterAuthOptions, betterAuth } from 'better-auth';
import { jwt } from 'better-auth/plugins';
import { DEFAULT_HUE } from '../../shared/color.ts';
import { DEFAULT_ALL_DAY_NOTIFY_MINUTES, PASSWORD_MIN_LENGTH } from '../../shared/constants.ts';
import { newId } from '../../shared/id.ts';
import { authDatabase } from './db/auth-adapter.ts';
import { env, resolveBaseUrl } from './env.ts';

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

/** このデプロイの Vercel 上の URL。Vercel のシステム環境変数なので、公開設定が無ければ空になる。 */
const vercelHosts = [env.VERCEL_URL, env.VERCEL_BRANCH_URL].filter(
  (host): host is string => !!host,
);

const options = {
  /**
   * 公開 URL が決まっている本番・ローカル・E2E は APP_URL に固定する。APP_URL が無い Preview は
   * URL がデプロイごとに変わるので、このデプロイとブランチの URL に限ってリクエストのホストから
   * 決める（Vercel の他の利用者のホストは信頼しない）。
   * どちらも分からないときに空の allowedHosts を渡すと better-auth が起動時に例外を投げ、
   * API が丸ごと落ちて何も使えなくなる。ログインできないだけで済むよう固定 URL に倒す。
   */
  baseURL:
    env.APP_URL ??
    (vercelHosts.length > 0
      ? { allowedHosts: vercelHosts, protocol: 'https', fallback: baseUrl }
      : baseUrl),
  basePath: '/api/auth',
  secret: env.BETTER_AUTH_SECRET,
  database: authDatabase,
  user: {
    // hue と終日の通知時刻も better-auth にセットで読ませることで、セッションの検証ついでに手に入る
    // （/me のためだけに users をもう一度読まずに済む）。入力としては受け取らない
    // （変更は users service を通す）。
    additionalFields: {
      hue: { type: 'number', input: false, required: true, defaultValue: DEFAULT_HUE },
      allDayNotifyMinutes: {
        type: 'number',
        input: false,
        required: true,
        defaultValue: DEFAULT_ALL_DAY_NOTIFY_MINUTES,
      },
    },
  },
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
      generateId: newId,
    },
    // better-auth は NODE_ENV=test のとき origin チェックを止める。受け入れるオリジンが
    // 環境で変わる以上テストで確かめたいので、本番と同じく常に有効にする。
    disableOriginCheck: false,
  },
  session: {
    // 2 人がヘビーに使う端末なので、ログイン状態は長く保つ
    expiresIn: 60 * 60 * 24 * 90,
    updateAge: 60 * 60 * 24,
    // 失効したセッションを Cookie キャッシュから復活させない。
    cookieCache: { enabled: false },
  },
} satisfies BetterAuthOptions;

const createAuth = () => betterAuth(options);
type Auth = ReturnType<typeof createAuth>;
type AuthSession = Auth['$Infer']['Session'];
export type AuthUser = AuthSession['user'];

let initializing: Promise<Auth> | undefined;

/**
 * 初期化を終えた better-auth を返す。最初の呼び出しで作り、以後は同じものを返す。
 *
 * better-auth は作った時点で初期化（oauth-provider の MCP リソースの登録で DB に問い合わせる）を始め、
 * その結果を持ち続ける。一度失敗すると、そのインスタンスは認証の要求をすべて同じエラーで失敗させる。
 * - モジュールの読み込み時に作らず、要求の中で作って初期化を待つ。Vercel Function は応答を返すと止まる
 *   ので、要求の外で始めた DB への問い合わせは止まっている間に接続が切れて失敗する。
 * - 初期化に失敗したら持たずに捨て、次の要求で作り直す。一時的な接続の失敗でインスタンスが止まるまで
 *   認証が使えなくなるのを防ぐ。
 *
 * WHY NOT 初期化時の登録を止める・遅らせる: oauth-provider にその設定は無い（`resourceSeedMode` は既存の行を
 * 上書きするかどうかだけを決める）。@better-auth/mcp は `resource` を必ず登録対象に加える。
 * WHY NOT Neon への fetch を失敗時に再送する: 送った後に切れた要求は DB 側で実行済みかもしれず、書き込みを
 * 二重に実行しうる。要求の外で問い合わせを始める限り、再送しても止まっている間に切れうる。
 */
export function getAuth(): Promise<Auth> {
  initializing ??= (async () => {
    const auth = createAuth();
    await auth.$context;
    return auth;
  })().catch((error: unknown) => {
    initializing = undefined;
    throw error;
  });
  return initializing;
}
