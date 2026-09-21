import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * ログインの origin チェック。Preview は URL がデプロイごとに変わるので、
 * APP_URL が無いときも、このデプロイとブランチの URL に限定する。
 */

/** env.ts と auth.ts は読み込み時に環境変数を固めるので、設定を変えるにはモジュールごと作り直す。 */
async function importApp(appUrl: string) {
  vi.resetModules();
  vi.stubEnv('APP_URL', appUrl);
  vi.stubEnv('VERCEL_URL', 'lifehub-abc123-macrat.vercel.app');
  vi.stubEnv('VERCEL_BRANCH_URL', 'lifehub-git-security-macrat.vercel.app');
  return (await import('../app.ts')).app;
}

/** origin チェックが働くのは Cookie を持つリクエスト（＝ブラウザからの操作）。 */
function signIn(origin: string) {
  return new Request(`${origin}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, cookie: 'dummy=1' },
    body: JSON.stringify({ email: 'nobody@example.com', password: 'password' }),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('ログインの origin チェック', () => {
  it('他の Vercel 利用者のホストと Origin は拒否する', async () => {
    const app = await importApp('');
    expect((await app.request(signIn('https://attacker.vercel.app'))).status).toBe(403);
    const request = signIn('https://lifehub-abc123-macrat.vercel.app');
    request.headers.set('origin', 'https://attacker.vercel.app');
    expect((await app.request(request)).status).toBe(403);
  });

  it('ブランチの URL からログインできる', async () => {
    const app = await importApp('');
    expect(
      (await app.request(signIn('https://lifehub-git-security-macrat.vercel.app'))).status,
    ).toBe(401);
  });
  it('APP_URL が無いとき（Preview）は Preview の URL からログインできる', async () => {
    const app = await importApp('');
    const res = await app.request(signIn('https://lifehub-abc123-macrat.vercel.app'));
    // 認証情報が無いので 401。origin で弾かれた場合は 403 になる。
    expect(res.status).toBe(401);
  });

  it('APP_URL が無くても vercel.app 以外のオリジンは拒む', async () => {
    const app = await importApp('');
    const res = await app.request(signIn('https://evil.example.com'));
    expect(res.status).toBe(403);
  });

  it('APP_URL があるとき（本番）は APP_URL のオリジンだけを受け入れる', async () => {
    const app = await importApp('https://lifehub.crat.jp');
    expect((await app.request(signIn('https://lifehub.crat.jp'))).status).toBe(401);
    expect((await app.request(signIn('https://lifehub-abc123-macrat.vercel.app'))).status).toBe(
      403,
    );
  });
});
