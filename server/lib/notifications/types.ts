import { TIME_ZONE } from '../../../shared/constants.ts';

export type NotificationPayload = {
  title: string;
  body: string;
  /** タップで開く画面（アプリ内パス） */
  url: string;
  /** 送信先（参加者） */
  userIds: string[];
};

/** 通知本文の日時「9/20 15:00」（JST） */
export const notificationTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: TIME_ZONE,
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
