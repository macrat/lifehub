import { z } from 'zod';
import { DEFAULT_ALL_DAY_NOTIFY_MINUTES } from '../../../shared/constants.ts';
import {
  addDays,
  fromMinutesOfDay,
  inclusiveEndDate,
  startOfDate,
  toDateString,
} from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import { instantSchema, uuidSchema } from '../../../shared/validation/common.ts';
import {
  type NotificationPayload,
  notificationDateFormatter,
  notificationTimeFormatter,
} from '../../lib/notifications/types.ts';
import { findAllDayNotifyMinutes } from '../users/repository.ts';
import { type CalendarItem, listItems } from './occurrences.ts';

const EDGES = ['start', 'end'] as const;
type Edge = (typeof EDGES)[number];
const DAY_MINUTES = 1440;
const DAY_MS = DAY_MINUTES * 60 * 1000;
/** 配信予定時刻と発生の日時の最大の隔たり。終日の「前日」の通知は 1 日と通知時刻の分だけ離れる */
const MAX_REMIND_MS = 2 * DAY_MS;

/** 配信時に再検証するための参照。QStash のメッセージ本文に載せ、配信時に Zod で読み直す */
export const notificationRefSchema = z.object({
  id: uuidSchema,
  /** 繰り返しの回。単発は null */
  occurrenceStart: z.string().nullable(),
  edge: z.enum(EDGES),
  /** 予約したときの配信予定時刻。日時が変わってずれていたら送らない */
  at: instantSchema,
  /**
   * 宛先を 1 人に絞るときのユーザー。終日の項目は参加者ごとの通知時刻に送るので、参加者ごとに予約する。
   * 時刻のある項目は null（参加者全員に同じ時刻で送る）
   */
  userId: uuidSchema.nullable().default(null),
});
export type NotificationRef = z.infer<typeof notificationRefSchema>;

export type PlannedNotification = {
  /** 冪等性のための一意キー（QStash の deduplicationId と送信台帳の主キー）。中身は読まない */
  key: string;
  at: Date;
  ref: NotificationRef;
};

function keyOf(ref: NotificationRef): string {
  const user = ref.userId ? `:${ref.userId}` : '';
  return `event:${ref.id}:${ref.occurrenceStart ?? 'single'}:${ref.edge}:${ref.at.toISOString()}${user}`;
}

/** ユーザー ID → 終日の項目の通知時刻（その日の 0:00 からの分） */
type NotifyTimes = Map<string, number>;

/** 終日の項目の開始日／終了日（期限日）。終了は排他的（翌日 0:00）なので含む終了日にする */
function allDayDate(anchor: string, edge: Edge): DateString {
  return edge === 'start' ? toDateString(new Date(anchor)) : inclusiveEndDate(anchor);
}

/**
 * 開始／終了（期限）の通知の宛先と配信予定時刻。完了したタスクには送らない。
 * - 時刻のある項目: n 分前に参加者全員へ
 * - 終日の項目: その日（n > 0 なら n 分を日に切り上げた日数だけ前の日）の、参加者それぞれの通知時刻に。
 *   終日の項目には「n 分前」の瞬間が無く（0:00 の n 分前では夜中に届く）、朝に知りたい時刻は人それぞれなので
 */
function remindTargets(
  item: CalendarItem,
  edge: Edge,
  notifyTimes: NotifyTimes,
): { at: Date; userId: string | null }[] {
  if (item.completedAt !== null) return [];
  const minutes = edge === 'start' ? item.remindStartMinutes : item.remindEndMinutes;
  const anchor = edge === 'start' ? item.startsAt : item.endsAt;
  if (minutes === null || !anchor) return [];
  if (!item.allDay)
    return [{ at: new Date(new Date(anchor).getTime() - minutes * 60 * 1000), userId: null }];
  const day = addDays(allDayDate(anchor, edge), -Math.ceil(minutes / DAY_MINUTES));
  return item.participantIds.map((userId) => ({
    at: new Date(fromMinutesOfDay(day, notifyTimes.get(userId) ?? DEFAULT_ALL_DAY_NOTIFY_MINUTES)),
    userId,
  }));
}

/**
 * 配信予定時刻が [from, to) に入りうる発生を、日ごとの重複（複数日の予定）を除いて列挙する。
 * `now` は範囲とは別に受け取る。タスクの表示位置と繰り返しの放棄はここを基準に決まるので、
 * 範囲の先頭を流用すると、配信時の再検証（範囲を配信予定時刻の前後 1 日に取る）で 1 日前の
 * 状態を見てしまい、リンク先の日付がずれる。
 */
async function itemsAround(range: { from: Date; to: Date }, now: Date): Promise<CalendarItem[]> {
  // タスクの表示位置は「今日」に繰り越されるので前後 1 日を含め、予定は最大リマインド分だけ先まで読む
  const items = await listItems(
    {
      from: addDays(toDateString(range.from), -1),
      to: addDays(toDateString(new Date(range.to.getTime() + MAX_REMIND_MS)), 1),
    },
    now,
  );
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.id}:${item.occurrenceStart}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 本文: 「開始 9/20 15:00 ・ 場所」。終日は日付だけ（「開始 9/20 終日」） */
function body(item: CalendarItem, edge: Edge): string {
  const label = edge === 'start' ? '開始' : item.kind === 'task' ? '期限' : '終了';
  const anchor = (edge === 'start' ? item.startsAt : item.endsAt) as string;
  const when = item.allDay
    ? `${notificationDateFormatter.format(startOfDate(allDayDate(anchor, edge)))} 終日`
    : notificationTimeFormatter.format(new Date(anchor));
  const location = item.location ? ` ・ ${item.location}` : '';
  return `${label} ${when}${location}`;
}

/** [from, to) に配信すべき通知（予定・タスクの開始／終了の n 分前、参加者の全端末へ） */
export async function listNotifications(range: {
  from: Date;
  to: Date;
}): Promise<PlannedNotification[]> {
  const planned: PlannedNotification[] = [];
  // 予約する範囲の先頭時点の状態で数える（日次 Cron は翌日分を、作成・変更時は今からの分を予約する）
  const [items, notifyTimes] = await Promise.all([
    itemsAround(range, range.from),
    findAllDayNotifyMinutes(),
  ]);
  for (const item of items) {
    for (const edge of EDGES) {
      for (const { at, userId } of remindTargets(item, edge, notifyTimes)) {
        if (at < range.from || at >= range.to) continue;
        const ref = { id: item.id, occurrenceStart: item.occurrenceStart, edge, at, userId };
        planned.push({ key: keyOf(ref), at, ref });
      }
    }
  }
  return planned;
}

/** 配信直前の再検証。削除・変更（配信予定時刻や通知時刻がずれた、宛先が参加者でなくなった）・完了済みなら null */
export async function resolveNotification(
  ref: NotificationRef,
): Promise<NotificationPayload | null> {
  // 配信予定時刻の時点の状態で見る（QStash の再送で実時刻がずれても、通知が指す瞬間は変わらない）
  const [items, notifyTimes] = await Promise.all([
    itemsAround(
      {
        from: new Date(ref.at.getTime() - MAX_REMIND_MS),
        to: new Date(ref.at.getTime() + MAX_REMIND_MS),
      },
      ref.at,
    ),
    findAllDayNotifyMinutes(),
  ]);
  const item = items.find((i) => i.id === ref.id && i.occurrenceStart === ref.occurrenceStart);
  if (!item) return null;
  const target = remindTargets(item, ref.edge, notifyTimes).find(
    (t) => t.userId === ref.userId && t.at.getTime() === ref.at.getTime(),
  );
  if (!target) return null;
  return {
    title: item.kind === 'task' ? `タスク: ${item.title}` : item.title,
    body: body(item, ref.edge),
    url: `/calendar?date=${item.placementDate}`,
    userIds: target.userId ? [target.userId] : item.participantIds,
  };
}
