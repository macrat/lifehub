import { z } from 'zod';

/**
 * サーバーが参照する環境変数。起動時に一度だけ検証し、以後は型付きで参照する。
 * 値の出所は `.env.example`（ローカル）と `infra/vercel.tf`（Vercel）。
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  /** アプリの公開 URL。Vercel では VERCEL_URL から導出する（下記 resolveBaseUrl）。 */
  APP_URL: z.url().optional(),
  CRON_SECRET: z.string().min(1).optional(),
  QSTASH_TOKEN: z.string().optional(),
  QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  /** Vercel が自動で設定する。`production` のときだけ通知の予約を行う。 */
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  VERCEL_URL: z.string().optional(),
  /** Vercel 上で実行中かどうか。DB ドライバの切替に使う。 */
  VERCEL: z.string().optional(),
});

const emptyToUndefined = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k, v === '' ? undefined : v]),
);

export const env = envSchema.parse(emptyToUndefined);

/**
 * 公開 URL。Preview でもログインと OAuth が動くよう、Vercel 上では VERCEL_URL を優先する。
 * 本番は Terraform が APP_URL に独自ドメインを設定する。
 */
export function resolveBaseUrl(): string {
  if (env.APP_URL) return env.APP_URL;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return 'http://localhost:5173';
}

export const isProduction = env.VERCEL_ENV === 'production';
