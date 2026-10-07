import { z } from 'zod';
import { MONEY_ACCOUNT_KINDS } from '../../shared/money.ts';

/**
 * Money Forward から取り込む口座（`MONEYFORWARD_ACCOUNTS`）。`種類:名前` をカンマで区切って並べる
 * （`bank:三井住友銀行,securities:SBI証券,card:楽天カード`）。名前は Money Forward に出る金融機関の名前そのもの。
 * 並べた順がお金の画面のカードの順になる。種類は `MONEY_ACCOUNT_KINDS`。
 * WHY 種類を書かせる: カードに出す値（残高か次回の引き落としか）が種類で決まり、Money Forward の画面から
 * 種類を読み取るより、書いてもらうほうが確か。
 */
const moneyAccountsSchema = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .filter((entry) => entry.trim() !== '')
      .map((entry) => {
        const [kind = '', ...name] = entry.split(':');
        return { kind: kind.trim(), name: name.join(':').trim() };
      }),
  )
  .pipe(
    z
      .array(z.object({ kind: z.enum(MONEY_ACCOUNT_KINDS), name: z.string().min(1) }))
      .min(1)
      .refine((accounts) => new Set(accounts.map((a) => a.name)).size === accounts.length, {
        message: '同じ名前の口座が 2 度書かれています',
      }),
  );

/**
 * サーバーが参照する環境変数。起動時に一度だけ検証し、以後は型付きで参照する。
 * 値の出所は `.env.example`（ローカル）と `infra/vercel.tf`（Vercel）。
 */
const envObject = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  /** アプリの公開 URL。Vercel では VERCEL_URL から導出する（下記 resolveBaseUrl）。 */
  APP_URL: z.url().optional(),
  CRON_SECRET: z.string().min(1).optional(),
  QSTASH_TOKEN: z.string().min(1).optional(),
  QSTASH_CURRENT_SIGNING_KEY: z.string().min(1).optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().min(1).optional(),
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().min(1).optional(),
  /** Money Forward ID のメールアドレスとパスワード。口座の取り込み（server/features/money/）がログインに使う */
  MONEYFORWARD_EMAIL: z.string().min(1).optional(),
  MONEYFORWARD_PASSWORD: z.string().min(1).optional(),
  /**
   * Money Forward ID の 2 段階認証（認証アプリ）の秘密鍵（base32）。2 段階認証を使っていなければ要らない。
   * 新しい端末からのログインで確認コードを求められたとき、メールの代わりにこれで答える
   */
  MONEYFORWARD_TOTP_SECRET: z.string().min(1).optional(),
  /** 取り込むときに選ぶ Money Forward のグループ（docs/features/money.md） */
  MONEYFORWARD_GROUP: z.string().min(1).optional(),
  /** 取り込む口座（`moneyAccountsSchema`） */
  MONEYFORWARD_ACCOUNTS: moneyAccountsSchema.optional(),
  /** Sentry への送り先（server/lib/sentry.ts）。無ければ送らない（ローカル・テスト・Preview）。 */
  SENTRY_DSN: z.url().optional(),
  // ここから下は Vercel のシステム環境変数。Vercel プロジェクトの「システム環境変数の公開」
  // （infra/vercel.tf の automatically_expose_system_environment_variables）が有効なときだけ存在する。
  /** `production` のときだけ通知の予約を行う。下記 PRODUCTION_REQUIRED の判定もこれで行う。 */
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  /** このデプロイ固有の URL（`<project>-<hash>-<scope>.vercel.app`）。 */
  VERCEL_URL: z.string().optional(),
  /** ブランチの最新デプロイを指す URL（`<project>-git-<branch>-<scope>.vercel.app`）。 */
  VERCEL_BRANCH_URL: z.string().optional(),
  /** Vercel 上で実行中かどうか。DB ドライバの切替に使う。 */
  VERCEL: z.string().optional(),
});

export type Env = z.infer<typeof envObject>;

/** 取り込む口座 1 つ（`MONEYFORWARD_ACCOUNTS` の 1 項目） */
export type MoneyForwardAccount = z.infer<typeof moneyAccountsSchema>[number];

/**
 * 本番で必ず要る変数。1 つでも欠けていれば起動しない。
 * 欠けたままでも通知の予約（`server/features/notifications/publisher.ts`）と送信（`server/features/push/service.ts`）、
 * Sentry への送信（`server/lib/sentry.ts`）、口座の取り込み（`server/features/money/service.ts`）は何もせずに正常終了してしまい、画面にもログにも異常が出ないので、
 * 起動時に落とすしかない。
 * Preview には本番の秘密情報を渡さない（`infra/vercel.tf`）ので対象は production だけ。
 */
const PRODUCTION_REQUIRED = [
  'APP_URL',
  'CRON_SECRET',
  'QSTASH_TOKEN',
  'QSTASH_CURRENT_SIGNING_KEY',
  'QSTASH_NEXT_SIGNING_KEY',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'SENTRY_DSN',
  'MONEYFORWARD_EMAIL',
  'MONEYFORWARD_PASSWORD',
  'MONEYFORWARD_ACCOUNTS',
] as const satisfies readonly (keyof Env)[];

const envSchema = envObject.superRefine((value, ctx) => {
  if (value.VERCEL_ENV !== 'production') return;
  for (const key of PRODUCTION_REQUIRED) {
    if (value[key] !== undefined) continue;
    ctx.addIssue({ code: 'custom', path: [key], message: '本番では必須です' });
  }
});

/**
 * 環境変数を読み、足りなければ理由を並べて投げる（起動を止める）。
 * Vercel は値を消した変数を空文字で渡してくるので、空文字は未設定として扱う。
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(
    Object.fromEntries(Object.entries(source).map(([k, v]) => [k, v === '' ? undefined : v])),
  );
  if (parsed.success) return parsed.data;
  const lines = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`環境変数が正しくありません:\n${lines.join('\n')}`);
}

export const env = parseEnv(process.env);

/**
 * 絶対 URL を組み立てるための公開 URL（QStash のコールバック先と MCP のリソース識別子）。
 * 本番は Terraform が APP_URL に独自ドメインを設定する。APP_URL の無い Preview は VERCEL_URL を使う。
 * リクエストごとに変わる Preview の URL には追従できないので、ログインの origin 判定はこれを使わず、
 * better-auth の baseURL（server/lib/auth.ts）がリクエストのホストから決める。
 */
export function resolveBaseUrl(): string {
  if (env.APP_URL) return env.APP_URL;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return 'http://localhost:5173';
}

export const isProduction = env.VERCEL_ENV === 'production';
