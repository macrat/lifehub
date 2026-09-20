import { addDays, diffDays, startOfDate, toDateString } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import * as events from '../events/service.ts';
import * as tasks from '../tasks/service.ts';

/**
 * カレンダー／イベント画面が読む統合項目。予定とタスクの差はカードの描画と操作にだけ現れる。
 * placementDate は JST の暦日。複数日にまたがる予定は日ごとに 1 件になる。タスクの位置は tasks service の規則。
 */
export type CalendarEventItem = events.EventOccurrence & {
  kind: 'event';
  placementDate: DateString;
  /** 複数日の予定での何日目か（1 始まり）と総日数 */
  dayIndex: number;
  dayCount: number;
};

export type CalendarTaskItem = tasks.TaskOccurrence & { kind: 'task' };

export type CalendarItem = CalendarEventItem | CalendarTaskItem;

/** [from, to]（両端含む JST 暦日）の項目を placementDate 順に返す。同日内は終日の予定 → 時刻順、時刻の無いタスクは末尾。 */
export async function listItems(
  range: { from: DateString; to: DateString },
  now: Date = new Date(),
): Promise<CalendarItem[]> {
  const [occurrences, taskOccurrences] = await Promise.all([
    events.listOccurrences({
      from: startOfDate(range.from),
      to: startOfDate(addDays(range.to, 1)),
    }),
    tasks.listOccurrences(range, now),
  ]);
  const items: CalendarItem[] = [];
  for (const occurrence of occurrences) {
    items.push(...placeEvent(occurrence, range));
  }
  for (const occurrence of taskOccurrences) {
    items.push({ ...occurrence, kind: 'task' });
  }
  return items.sort(compareItems);
}

function placeEvent(
  occurrence: events.EventOccurrence,
  range: { from: DateString; to: DateString },
): CalendarEventItem[] {
  const startsAt = new Date(occurrence.startsAt);
  const endsAt = new Date(occurrence.endsAt);
  const firstDay = toDateString(startsAt);
  // 終端は排他的なので 1ms 手前の日。長さ 0 なら開始日
  const lastDay =
    endsAt.getTime() > startsAt.getTime() ? toDateString(new Date(endsAt.getTime() - 1)) : firstDay;
  const dayCount = diffDays(firstDay, lastDay) + 1;
  const result: CalendarEventItem[] = [];
  for (let i = 0; i < dayCount; i++) {
    const day = addDays(firstDay, i);
    if (day < range.from || day > range.to) continue;
    result.push({ ...occurrence, kind: 'event', placementDate: day, dayIndex: i + 1, dayCount });
  }
  return result;
}

/** 同日内の並び順のキー: 終日の予定 → 時刻のある項目（予定の開始、タスクの開始または期限）→ 時刻の無いタスク */
function sortKey(item: CalendarItem): string {
  if (item.kind === 'event') return item.allDay ? '' : item.startsAt;
  return item.startsAt ?? item.dueAt ?? '~';
}

function compareItems(a: CalendarItem, b: CalendarItem): number {
  if (a.placementDate !== b.placementDate) return a.placementDate < b.placementDate ? -1 : 1;
  return sortKey(a).localeCompare(sortKey(b));
}
