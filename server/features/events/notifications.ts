import { addDays, toDateString } from '../../../shared/date.ts';
import {
  type NotificationSource,
  notificationTimeFormatter,
  type PlannedNotification,
  splitKey,
} from '../../lib/notifications/types.ts';
import { type CalendarItem, listItems } from './occurrences.ts';

const SOURCE_ID = 'event';
const EDGES = ['start', 'end'] as const;
type Edge = (typeof EDGES)[number];
const MAX_REMIND_MS = 1440 * 60 * 1000;

/** キー: event:<id>:<occurrenceStart ISO | single>:<start|end>:<配信予定時刻 ISO> */
function keyOf(item: CalendarItem, edge: Edge, at: Date): string {
  return `${SOURCE_ID}:${item.id}:${item.occurrenceStart ?? 'single'}:${edge}:${at.toISOString()}`;
}

/** 開始／終了（期限）の n 分前。完了したタスクには送らない */
function remindAt(item: CalendarItem, edge: Edge): Date | null {
  if (item.completedAt !== null) return null;
  const minutes = edge === 'start' ? item.remindStartMinutes : item.remindEndMinutes;
  const anchor = edge === 'start' ? item.startsAt : item.endsAt;
  if (minutes === null || !anchor) return null;
  return new Date(new Date(anchor).getTime() - minutes * 60 * 1000);
}

/** 配信予定時刻が [from, to) に入る発生を、日ごとの重複（複数日の予定）を除いて列挙する */
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

function body(item: CalendarItem, edge: Edge, at: Date): string {
  if (item.kind === 'event' && item.allDay) return `${toDateString(new Date(item.startsAt))} 終日`;
  const label = edge === 'start' ? '開始' : item.kind === 'task' ? '期限' : '終了';
  const time = notificationTimeFormatter.format(new Date(at.getTime()));
  const anchor = edge === 'start' ? item.startsAt : item.endsAt;
  const location = item.location ? ` ・ ${item.location}` : '';
  return `${label} ${anchor ? notificationTimeFormatter.format(new Date(anchor)) : time}${location}`;
}

/** 予定・タスクの開始／終了（期限）の n 分前に、参加者の全端末へ */
export const eventsNotificationSource: NotificationSource = {
  id: SOURCE_ID,
  list: async (range) => {
    const planned: PlannedNotification[] = [];
    for (const item of await itemsAround(range)) {
      for (const edge of EDGES) {
        const at = remindAt(item, edge);
        if (!at || at < range.from || at >= range.to) continue;
        planned.push({ key: keyOf(item, edge, at), at });
      }
    }
    return planned;
  },
  resolve: async (key) => {
    const parsed = splitKey(SOURCE_ID, key);
    if (!parsed) return null;
    const { id, rest, scheduledAt } = parsed;
    const edgeIndex = rest.lastIndexOf(':');
    const occurrenceStart = rest.slice(0, edgeIndex);
    const edge = EDGES.find((e) => e === rest.slice(edgeIndex + 1));
    if (!edge) return null;
    const items = await itemsAround({
      from: new Date(scheduledAt.getTime() - MAX_REMIND_MS),
      to: new Date(scheduledAt.getTime() + MAX_REMIND_MS),
    });
    const item = items.find(
      (i) => i.id === id && (i.occurrenceStart ?? 'single') === occurrenceStart,
    );
    if (!item) return null;
    const at = remindAt(item, edge);
    // 通知設定が消えた、または日時が変わって配信時刻がずれたら送らない（新しい時刻で別途予約される）
    if (!at || at.getTime() !== scheduledAt.getTime()) return null;
    return {
      title: item.kind === 'task' ? `タスク: ${item.title}` : item.title,
      body: body(item, edge, at),
      url: `/calendar?date=${item.placementDate}`,
      userIds: item.participantIds,
    };
  },
};
