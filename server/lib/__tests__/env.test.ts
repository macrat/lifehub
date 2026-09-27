import { describe, expect, it } from 'vitest';
import { parseEnv } from '../env.ts';

/** 起動できる最小の組み合わせ（ローカル・テスト） */
const base = {
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/lifehub',
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-0000',
};

/** 本番で必須の変数（infra/vercel.tf が production にだけ設定する） */
const production = {
  ...base,
  VERCEL_ENV: 'production',
  APP_URL: 'https://lifehub.example.com',
  CRON_SECRET: 'cron-secret',
  QSTASH_TOKEN: 'qstash-token',
  QSTASH_CURRENT_SIGNING_KEY: 'sig-current',
  QSTASH_NEXT_SIGNING_KEY: 'sig-next',
  VAPID_PUBLIC_KEY: 'vapid-public',
  VAPID_PRIVATE_KEY: 'vapid-private',
  VAPID_SUBJECT: 'mailto:admin@example.com',
  SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0',
};

describe('環境変数', () => {
  it('必須が欠けていれば起動しない', () => {
    expect(() => parseEnv({ BETTER_AUTH_SECRET: base.BETTER_AUTH_SECRET })).toThrow('DATABASE_URL');
  });

  it('ローカルでは通知用の変数が無くてもよい', () => {
    expect(parseEnv(base).QSTASH_TOKEN).toBeUndefined();
  });

  it('本番で通知用の変数が欠けていれば、欠けているものを並べて起動しない', () => {
    const { QSTASH_TOKEN, VAPID_PRIVATE_KEY, ...rest } = production;
    expect(() => parseEnv(rest)).toThrow(/QSTASH_TOKEN[\s\S]*VAPID_PRIVATE_KEY/);
  });

  it('本番で値が空文字なら未設定として扱う', () => {
    expect(() => parseEnv({ ...production, QSTASH_TOKEN: '' })).toThrow('QSTASH_TOKEN');
  });

  it('Preview は本番の秘密情報を持たないので対象外', () => {
    expect(parseEnv({ ...base, VERCEL_ENV: 'preview' }).VERCEL_ENV).toBe('preview');
  });

  it('本番で揃っていれば起動する', () => {
    expect(parseEnv(production).QSTASH_TOKEN).toBe('qstash-token');
  });
});
