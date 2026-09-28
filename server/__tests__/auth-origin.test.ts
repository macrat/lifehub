import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { app as App } from '../app.ts';

/**
 * ログインの origin チェック。Preview は URL がデプロイごとに変わるので、
 * APP_URL が無いときも、このデプロイとブランチの URL に限定する。
 */

/**
 * env.ts と auth.ts は読み込み時に環境変数を固めるので、設定を変えるにはモジュールごと作り直す。
 * 作り直しは重いので、同じ設定のテストは describe ごとに 1 度だけ読み込んだものを使う。
 */
function appWith(appUrl: string, { vercelHosts = true } = {}): () => typeof App {
  let app: typeof App | undefined;
  beforeAll(async () => {
    vi.resetModules();
    vi.stubEnv('APP_URL', appUrl);
    vi.stubEnv('VERCEL_URL', vercelHosts ? 'lifehub-abc123-macrat.vercel.app' : '');
    vi.stubEnv('VERCEL_BRANCH_URL', vercelHosts ? 'lifehub-git-security-macrat.vercel.app' : '');
    try {
      app = (await import('../app.ts')).app;
    } finally {
      vi.unstubAllEnvs();
    }
  });
  return () => {
    if (!app) throw new Error('app が読み込まれていない');
    return app;
  };
}

/** origin チェックが働くのは Cookie を持つリクエスト（＝ブラウザからの操作）。 */
function signIn(origin: string) {
  return new Request(`${origin}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, cookie: 'dummy=1' },
    body: JSON.stringify({ email: 'nobody@example.com', password: 'password' }),
  });
}

/** origin で弾かれたら 403。通ったときは認証情報が無いので 401 になる */
const status = async (app: typeof App, request: Request) => (await app.request(request)).status;

// 後のテストファイルが、このファイルの環境変数で作ったモジュールを使わないようにする
afterAll(() => {
  vi.resetModules();
});

describe('APP_URL が無いとき（Preview）', () => {
  const app = appWith('');

  it('Preview とブランチの URL からログインできる', async () => {
    expect(await status(app(), signIn('https://lifehub-abc123-macrat.vercel.app'))).toBe(401);
    expect(await status(app(), signIn('https://lifehub-git-security-macrat.vercel.app'))).toBe(401);
  });

  it('他の Vercel 利用者のホストと Origin、vercel.app 以外のオリジンは拒否する', async () => {
    expect(await status(app(), signIn('https://attacker.vercel.app'))).toBe(403);
    const request = signIn('https://lifehub-abc123-macrat.vercel.app');
    request.headers.set('origin', 'https://attacker.vercel.app');
    expect(await status(app(), request)).toBe(403);
    expect(await status(app(), signIn('https://evil.example.com'))).toBe(403);
  });
});

describe('Vercel のホストが分からないとき', () => {
  // Vercel のシステム環境変数が公開されていない場合。allowedHosts を空にすると
  // better-auth が作るときに例外を投げ、認証が丸ごと使えなくなる。
  const app = appWith('', { vercelHosts: false });

  it('起動でき、既定の URL だけを受け入れる', async () => {
    expect(await status(app(), signIn('http://localhost:5173'))).toBe(401);
    expect(await status(app(), signIn('https://lifehub-abc123-macrat.vercel.app'))).toBe(403);
  });
});

describe('APP_URL があるとき（本番）', () => {
  const app = appWith('https://lifehub.crat.jp');

  it('APP_URL のオリジンだけを受け入れる', async () => {
    expect(await status(app(), signIn('https://lifehub.crat.jp'))).toBe(401);
    expect(await status(app(), signIn('https://lifehub-abc123-macrat.vercel.app'))).toBe(403);
  });
});
