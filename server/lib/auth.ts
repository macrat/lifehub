import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { mcp } from '@better-auth/mcp';
import type { OAuthClaimExtensionInput } from '@better-auth/oauth-provider';
import { type BetterAuthOptions, betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { jwt } from 'better-auth/plugins';
import { DEFAULT_HUE } from '../../shared/color.ts';
import { DEFAULT_ALL_DAY_NOTIFY_MINUTES, PASSWORD_MIN_LENGTH } from '../../shared/constants.ts';
import { newId } from '../../shared/id.ts';
import { afterResponse } from './after-response.ts';
import { authDatabase, rateLimitStorage } from './db/auth-adapter.ts';
import { env, resolveBaseUrl } from './env.ts';

/**
 * better-auth の設定（メール＋パスワード、Drizzle アダプタ）。
 *
 * - 公開のサインアップ経路は disabledPaths で閉じる。ユーザー作成は users service（サーバー内部から
 *   auth.api.signUpEmail を呼ぶ）と scripts/create-user.ts だけが行う。
 *   `emailAndPassword.disableSignUp` は内部呼び出しも拒否するため使わない。
 * - ID は全テーブル共通規約に合わせて UUID v7 を生成する。
 * - MCP 向けに LifeHub 自身を OAuth 2.1 認可サーバーにする（@better-auth/mcp = oauth-provider の MCP 向け設定）。
 *   アクセストークンは JWT（jwt プラグイン）。クライアントの識別は Client ID Metadata Documents（cimd）だけを受け付ける
 *   （Dynamic Client Registration は閉じる。理由は docs/features/mcp.md）。
 */
const baseUrl = resolveBaseUrl();
export const MCP_RESOURCE = `${baseUrl}/api/mcp`;

/**
 * MCP のアクセストークン（JWT）に入れる、発行のもとになった許可（`oauth_consents` の行）の id のクレーム名。
 * `/api/mcp` はこの id の同意が今もあるかで失効を判定する（`server/mcp.ts`）。
 */
export const CONSENT_ID_CLAIM = 'consent_id';

/**
 * アクセストークンを発行するたび（認可コードの交換とリフレッシュ）に、そのユーザーのそのクライアントへの
 * 今の同意の id をトークンに入れ、同意が無ければ発行しない（理由は docs/features/mcp-clients.md の「失効」）。
 * WHY NOT mcp-clients の repository で引く: lib は features を読まない。同意の表は better-auth のものなので、
 * better-auth のアダプタで引く。
 */
async function bindConsent({ ctx, user, client }: OAuthClaimExtensionInput) {
  if (!user) return {};
  const consent = await ctx.context.adapter.findOne<{ id: string }>({
    model: 'oauthConsent',
    where: [
      { field: 'userId', value: user.id },
      { field: 'clientId', value: client.clientId },
    ],
  });
  if (!consent) {
    throw new APIError('BAD_REQUEST', {
      error: 'invalid_grant',
      error_description: 'the client is no longer authorized',
    });
  }
  return { [CONSENT_ID_CLAIM]: consent.id };
}

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
  /**
   * ログイン（`/sign-in/email`）の試行を IP ごとに 15 分で 10 回までに絞る。数えは DB の `rate_limits` に置き
   * （`server/lib/db/auth-adapter.ts` の `rateLimitStorage`）、Vercel Function のどのインスタンスでも同じ数えを使う。
   * 既定（10 秒で 3 回）だと 1 つの IP から 1 日に 2 万回以上試せる。家族の打ち間違いには十分な回数を残す。
   * - ログイン以外の口は数えない（`'/**': false`）。数えるたびに DB を引くので、MCP クライアントの
   *   トークンの更新（1 時間ごと）など日常の要求を遅くする。守りたいのはパスワードの推測だけ。
   * - 掛けるのは本番ビルドだけ。開発とテストでは、同じ IP からの大量のログインを止めない。
   * - WHY 既定（better-auth も NODE_ENV で決める）に任せず書く: better-auth は読み込み時に一度だけ決めるので、
   *   テストで本番の設定に作り直しても変わらない（server/__tests__/auth.test.ts）。
   * - WHY NOT メモリ（既定）: インスタンスごとに別々に数え、起動し直すと消えるので、数を絞っても効かない。
   * - WHY NOT secondary-storage（Redis など）: そのためだけに外部サービスを足すことになる。DB でも往復は 1 回で済む。
   * - WHY NOT アカウント（メールアドレス）ごとの制限: リスト型攻撃はアカウントごとに数回しか試さないので防げず、
   *   攻撃者が家族のメールアドレスを知っていればログインを締め出せてしまう。
   */
  rateLimit: {
    enabled: env.NODE_ENV === 'production',
    customStorage: rateLimitStorage,
    customRules: {
      // 先に書いた規則から当てる
      '/sign-in/email': { window: 15 * 60, max: 10 },
      '/**': false,
    },
  },
  disabledPaths: [
    '/sign-up/email',
    // jwt プラグインのセッション → JWT 交換。OAuth プロバイダとして動くときは閉じる（公式の推奨）
    '/token',
    // oauth-provider の、クライアントと同意を画面から管理する口と DCR。使わないので閉じる（docs/features/mcp.md。
    // 開ける口は server/__tests__/oauth-discovery.test.ts が確かめる）
    '/oauth2/register',
    '/oauth2/create-client',
    '/oauth2/get-client',
    '/oauth2/get-clients',
    '/oauth2/update-client',
    '/oauth2/client/rotate-secret',
    '/oauth2/delete-client',
    '/oauth2/public-client',
    '/oauth2/public-client-prelogin',
    '/oauth2/get-consent',
    '/oauth2/get-consents',
    '/oauth2/update-consent',
    '/oauth2/delete-consent',
  ],
  plugins: [
    jwt({ disableSettingJwtHeader: true }),
    mcp({
      loginPage: '/login',
      consentPage: '/consent',
      resource: MCP_RESOURCE,
      extensions: [{ claims: { accessToken: bindConsent } }],
    }),
    cimd({ fetchClientMetadataResource, metadataProfile: 'mcp-2026-07-28' }),
  ],
  advanced: {
    database: {
      generateId: newId,
      // セッションの確認（要求ごとに走る）で、セッションとユーザーを別々に読まず、結合して 1 回で読む。
      // 結合には Drizzle のリレーション（users/schema.ts の `sessionsRelations`）を使う
      joins: true,
    },
    // better-auth は NODE_ENV=test のとき origin チェックを止める。受け入れるオリジンが
    // 環境で変わる以上テストで確かめたいので、本番と同じく常に有効にする。
    disableOriginCheck: false,
    // better-auth の後始末（サインアウトしたセッションに結び付く OAuth のトークンの失効など）を応答の後に回す。
    // 渡さないと要求の中で待つ
    backgroundTasks: {
      handler: (task) => afterResponse('better-auth: background task', () => task.then(() => {})),
    },
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

/**
 * そのユーザーの今のパスワードか確かめる（本人の確認。`lib/trpc.ts` の `reauthedProcedure`）。
 * 手順は better-auth の `/verify-password` と同じで、資格情報の行の読み方もハッシュの照合もログインと揃う。
 * WHY NOT `auth.api.verifyPassword` を呼ぶ: 要求のヘッダーからセッションを引き直すので、
 * 確かめ済みのセッション（ctx.user）があるのにもう一度 DB を読む。
 */
export async function verifyUserPassword(userId: string, password: string): Promise<boolean> {
  const { internalAdapter, password: hasher } = await (await getAuth()).$context;
  const hash = (await internalAdapter.findCredentialAccount(userId))?.password;
  return !!hash && (await hasher.verify({ hash, password }));
}
