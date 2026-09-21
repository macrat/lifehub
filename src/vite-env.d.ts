/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** ビルドしたコミットの SHA（`build-info.ts` の define で注入される） */
declare const __BUILD_COMMIT__: string;

/** ビルドした日時（ISO 8601。`build-info.ts` の define で注入される） */
declare const __BUILD_TIME__: string;
