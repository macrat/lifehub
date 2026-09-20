import { z } from 'zod';
import { addDays, toDateString } from '../../../shared/date.ts';
import { instantSchema, uuidSchema } from '../../../shared/validation/common.ts';
import {
  type NotificationPayload,
  notificationTimeFormatter,
} from '../../lib/notifications/types.ts';
import { type CalendarItem, listItems } from './occurrences.ts';

const EDGES = ['start', 'end'] as const;
type Edge = (typeof EDGES)[number];
const MAX_REMIND_MS = 1440 * 60 * 1000;

/** 配信時に再検証するための参照。QStash のメッセージ本文に載せ、配信時に Zod で読み直す */
export const notificationRefSchema = z.object({
  id: uuidSchema,
  /** 繰り返しの回。単発は null */
  occurrenceStart: z.string().nullable(),
  edge: z.enum(EDGES),
  /** 予約したときの配信予定時刻。日時が変わってずれていたら送らない */
  at: instantSchema,
});
export type NotificationRef = z.infer<typeof notificationRefSchema>;

export type PlannedNotification = {
  /** 冪等性のための一意キー（QStash の deduplicationId と送信台帳の主キー）。中身は読まない */
  key: string;
  at: Date;
  ref: NotificationRef;
};

function keyOf(ref: NotificationRef): string {
  return `event:${ref.id}:${ref.occurrenceStart ?? 'single'}:${ref.edge}:${ref.at.toISOString()}`;
}

/** 開始／終了（期限）の n 分前。完了したタスクには送らない */
function remindAt(item: CalendarItem, edge: Edge): Date | null {
  if (item.completedAt !== null) return null;
  const minutes = edge === 'start' ? item.remindStartMinutes : item.remindEndMinutes;
  const anchor = edge === 'start' ? item.startsAt : item.endsAt;
  if (minutes === null || !anchor) return null;
  return new Date(new Date(anchor).getTime() - minutes * 60 * 1000);
}

/** 配信予定時刻が [from, to) に入りうる発生を、日ごとの重複（複数日の予定）を除いて列挙する */
async function itemsAround(range: { from: Date; to: Date }): Promise<CalendarItem[]> {
  // タスクの表示位置は「今日」に繰り越されるので前後 1 日を含め、予定は最大リマインド分だけ先まで読む
  const items = await listItems(
    {
      from: addDays(toDateString(range.from), -1),
      to: addDays(toDateString(new Date(range.to.getTime() + MAX_REMIND_MS)), 1),
    },
    range.from,
  );
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.id}:${item.occurrenceStart}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 本文: 「開始 9/20 15:00 ・ 場所」。終日の予定は日付だけ */
function body(item: CalendarItem, edge: Edge): string {
  if (item.kind === 'event' && item.allDay) return `${toDateString(new Date(item.startsAt))} 終日`;
  const label = edge === 'start' ? '開始' : item.kind === 'task' ? '期限' : '終了';
  const anchor = new Date((edge === 'start' ? item.startsAt : item.endsAt) as string);
  const location = item.location ? ` ・ ${item.location}` : '';
  return `${label} ${notificationTimeFormatter.format(anchor)}${location}`;
}

/** [from, to) に配信すべき通知（予定・タスクの開始／終了の n 分前、参加者の全端末へ） */
export async function listNotifications(range: {
  from: Date;
  to: Date;
}): Promise<PlannedNotification[]> {
  const planned: PlannedNotification[] = [];
  for (const item of await itemsAround(range)) {
    for (const edge of EDGES) {
      const at = remindAt(item, edge);
      if (!at || at < range.from || at >= range.to) continue;
      const ref = { id: item.id, occurrenceStart: item.occurrenceStart, edge, at };
      planned.push({ key: keyOf(ref), at, ref });
    }
  }
  return planned;
}

/** 配信直前の再検証。削除・変更（配信予定時刻がずれた）・完了済みなら null */
export async function resolveNotification(
  ref: NotificationRef,
): Promise<NotificationPayload | null> {
  const items = await itemsAround({
    from: new Date(ref.at.getTime() - MAX_REMIND_MS),
    to: new Date(ref.at.getTime() + MAX_REMIND_MS),
  });
  const item = items.find((i) => i.id === ref.id && i.occurrenceStart === ref.occurrenceStart);
  if (!item) return null;
  const at = remindAt(item, ref.edge);
  if (!at || at.getTime() !== ref.at.getTime()) return null;
  return {
    title: item.kind === 'task' ? `タスク: ${item.title}` : item.title,
    body: body(item, ref.edge),
    url: `/calendar?date=${item.placementDate}`,
    userIds: item.participantIds,
  };
}
