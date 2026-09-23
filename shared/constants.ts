/** アプリ全体で固定のタイムゾーン。表示・RRULE の評価・日付境界の計算はすべてこれで行う。 */
export const TIME_ZONE = 'Asia/Tokyo';

/** パスワードの最低文字数 */
export const PASSWORD_MIN_LENGTH = 12;

/** 1 日の分数 */
export const DAY_MINUTES = 24 * 60;

/**
 * 終日の予定・タスクの通知時刻（その日の 0:00 からの分）の既定: 朝 7:00。
 * 終日の項目には「開始の n 分前」の瞬間が無いので、ユーザーごとのこの時刻に送る（docs/features/notifications.md）。
 */
export const DEFAULT_ALL_DAY_NOTIFY_MINUTES = 7 * 60;
