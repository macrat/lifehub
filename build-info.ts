import { execSync } from 'node:child_process';

/**
 * ビルドの素性を注入する define。バグ報告のときにどの版を見ているかを確認できるよう
 * 設定画面に表示し、ビルド日時は永続化キャッシュの buster にも使う。
 * vite（本番ビルド・開発サーバー）と vitest の両方の設定から同じものを渡す。
 *
 * コミットは CI が渡す GITHUB_SHA、無ければ作業ツリーの HEAD。
 */
export const buildInfoDefine = {
  __BUILD_COMMIT__: JSON.stringify(
    process.env.GITHUB_SHA ?? execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
  ),
  __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
};
