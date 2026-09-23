/** 通知源（server/features/events/notifications.ts）が配信直前に返す、送る中身と宛先 */
export type NotificationPayload = {
  title: string;
  body: string;
  /** タップで開く画面（アプリ内パス） */
  url: string;
  /** 送信先（参加者） */
  userIds: string[];
};
