/**
 * Web Push の本文。サーバー（server/features/push/service.ts）が JSON にして送り、Service Worker（src/sw.ts）が読む。
 * 送る側と読む側が別々に形を書くとずれても型で気付けないので、ここ 1 か所に置いて両方が型として参照する。
 */
export type PushMessage = {
  title: string;
  body: string;
  /** タップで開く画面（アプリ内パス） */
  url: string;
  /** 通知を束ねるタグ（同じキーの再送で二重表示しない） */
  tag: string;
};
