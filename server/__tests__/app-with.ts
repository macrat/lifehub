import { afterAll, beforeAll, vi } from 'vitest';
import type { app as App } from '../app.ts';

/**
 * 環境変数を変えてアプリを作り直し、それを返す関数を渡す（describe の中で呼ぶ）。
 * env.ts と auth.ts は読み込み時に環境変数を固めるので、設定を変えるにはモジュールごと作り直す。
 * 作り直しは重いので、describe ごとに 1 度だけ読み込んだものを使う。
 * describe を抜けたら作り直したモジュールを捨て、後のテストが同じ環境変数で作ったものを使わないようにする。
 */
export function appWith(env: Record<string, string>): () => typeof App {
  let app: typeof App | undefined;
  beforeAll(async () => {
    vi.resetModules();
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    try {
      app = (await import('../app.ts')).app;
    } finally {
      vi.unstubAllEnvs();
    }
  });
  afterAll(() => {
    vi.resetModules();
  });
  return () => {
    if (!app) throw new Error('app が読み込まれていない');
    return app;
  };
}
