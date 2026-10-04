// クライアントのテストは React の act で描く（テスト用の描画ライブラリは入れていない。`src/lib/__tests__/render-hook.ts`）。
// act を使う環境だと React に知らせ、act の外での更新を警告させる
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
