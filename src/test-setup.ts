import { afterEach } from 'vitest';
import { cleanupHooks } from './lib/__tests__/render-hook.ts';

// クライアントのテストは React の act で描く（テスト用の描画ライブラリは入れていない。`src/lib/__tests__/render-hook.ts`）。
// act を使う環境だと React に知らせ、act の外での更新を警告させる
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 描いたフックはテストごとに外す（isolate: false で後のテストへ持ち越さない）
afterEach(cleanupHooks);
