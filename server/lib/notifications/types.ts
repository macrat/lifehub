/**
 * 通知の拡張ポイント。各 feature の notifications.ts が実装し、registry.ts に列挙する。
 * 「予約は使い捨て、配信時に再検証」方式（docs/features/notifications.md）。
 */
export type PlannedNotification = {
  /** 冪等性のための一意キー。`<source id>:` で始まり、配信予定時刻を含める（時刻が変われば別の予約になる） */
  key: string;
  /** 配信予定時刻 */
  at: Date;
};

export type NotificationPayload = {
  title: string;
  body: string;
  /** タップで開く画面（アプリ内パス） */
  url: string;
  /** 送信先。null なら全員 */
  userIds: string[] | null;
};

export type NotificationSource = {
  /** キーの先頭に付く識別子（例: 'event'） */
  id: string;
  /** [from, to) に発火すべき通知を列挙する */
  list: (range: { from: Date; to: Date }) => Promise<PlannedNotification[]>;
  /** 配信直前に再検証する。削除・変更されていれば null */
  resolve: (key: string) => Promise<NotificationPayload | null>;
};

/** キーの末尾の配信予定時刻（ISO 8601）を取り出す。時刻はコロンを含むので末尾から切り出す */
export function parseKeyTime(key: string): Date | null {
  const match = /:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$/.exec(key);
  if (!match?.[1]) return null;
  return new Date(match[1]);
}
