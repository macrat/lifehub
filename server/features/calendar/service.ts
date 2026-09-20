import { addDays, diffDays, startOfDate, toDateString } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import * as events from '../events/service.ts';

/**
 * カレンダー／イベント画面が読む統合項目。予定とタスクの差はカードの描画と操作にだけ現れる。
 * placementDate は JST の暦日。複数日にまたがる予定は日ごとに 1 件になる。
 */
export type CalendarEventItem = events.EventOccurrence & {
  kind: 'event';
  placementDate: DateString;
  /** 複数日の予定での何日目か（1 始まり）と総日数 */
  dayIndex: number;
  dayCount: number;
};

export type CalendarItem = CalendarEventItem;

/** [from, to]（両端含む JST 暦日）の項目を placementDate 順に返す。同日内は終日 → 時刻順。 */
export async function listItems(range: {
  from: DateString;
  to: DateString;
}): Promise<CalendarItem[]> {
  const occurrences = await events.listOccurrences({
    from: startOfDate(range.from),
    to: startOfDate(addDays(range.to, 1)),
  });
  const items: CalendarItem[] = [];
  for (const occurrence of occurrences) {
    items.push(...placeEvent(occurrence, range));
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

function compareItems(a: CalendarItem, b: CalendarItem): number {
  if (a.placementDate !== b.placementDate) return a.placementDate < b.placementDate ? -1 : 1;
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return a.startsAt.localeCompare(b.startsAt);
}
