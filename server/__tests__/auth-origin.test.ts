import { describe, expect, it } from 'vitest';
import type { app as App } from '../app.ts';
import { appWith } from './app-with.ts';

/**
 * ログインの origin チェック。Preview は URL がデプロイごとに変わるので、
 * APP_URL が無いときも、このデプロイとブランチの URL に限定する。
 */

/** APP_URL と、このデプロイ・ブランチの Vercel 上の URL を決めてアプリを作り直す */
function originApp(appUrl: string, { vercelHosts = true } = {}): () => typeof App {
  return appWith({
    APP_URL: appUrl,
    VERCEL_URL: vercelHosts ? 'lifehub-abc123-macrat.vercel.app' : '',
    VERCEL_BRANCH_URL: vercelHosts ? 'lifehub-git-security-macrat.vercel.app' : '',
  });
}

/** origin チェックが働くのは Cookie を持つリクエスト（＝ブラウザからの操作）。 */
function signIn(origin: string) {
  return new Request(`${origin}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, cookie: 'dummy=1' },
    body: JSON.stringify({ email: 'nobody', password: 'password' }),
  });
}

/**
 * origin で弾かれたら 403。通ったときはメールの形が正しくないので 400 になる。
 * WHY 形の正しくないメール: 正しい形だと、いないユーザーでも時間差を隠すためにパスワードのハッシュ（scrypt）が走り、1 回 100ms ほどかかる
 */
const status = async (app: typeof App, request: Request) => (await app.request(request)).status;

describe('APP_URL が無いとき（Preview）', () => {
  const app = originApp('');

  it('Preview とブランチの URL からログインできる', async () => {
    expect(await status(app(), signIn('https://lifehub-abc123-macrat.vercel.app'))).toBe(400);
    expect(await status(app(), signIn('https://lifehub-git-security-macrat.vercel.app'))).toBe(400);
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
  const app = originApp('', { vercelHosts: false });

  it('起動でき、既定の URL だけを受け入れる', async () => {
    expect(await status(app(), signIn('http://localhost:5173'))).toBe(400);
    expect(await status(app(), signIn('https://lifehub-abc123-macrat.vercel.app'))).toBe(403);
  });
});

describe('APP_URL があるとき（本番）', () => {
  const app = originApp('https://lifehub.crat.jp');

  it('APP_URL のオリジンだけを受け入れる', async () => {
    expect(await status(app(), signIn('https://lifehub.crat.jp'))).toBe(400);
    expect(await status(app(), signIn('https://lifehub-abc123-macrat.vercel.app'))).toBe(403);
  });
});
