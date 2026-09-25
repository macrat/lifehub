import { type CalendarItem, placeOnce } from '../../../shared/calendar.ts';
import { toDateString } from '../../../shared/date.ts';
import type { InstantRange } from '../../lib/history.ts';
import { expandOccurrences } from '../../lib/recurrence/index.ts';
import { listOccurrences } from './occurrences.ts';
import * as repository from './repository.ts';

/**
 * ホームのタイムライン（`features/timeline`）に予定・タスクを渡す口。
 * 行を置く日時の規則は shared/timeline.ts の `eventEntry` が持ち、ここは回を展開して渡すだけにする。
 */

/**
 * タイムラインのページ分け: 日時が before より前の、新しいほうから（少なくとも）limit 件の日時。
 * 単発の行と実体化された回は DB で絞り、繰り返す予定は繰り返し元ごとに before の直前の limit 回を展開する。
 * 並びは問わない（呼び出し側がほかの記録と合わせて並べる）
 */
export async function recentTimelineInstants(
  before: Date,
  q: string | undefined,
  limit: number,
): Promise<Date[]> {
  const [instants, recurring] = await Promise.all([
    repository.findRecentTimelineInstants(before, q, limit),
    repository.findRecurringEventsBefore(before, q),
  ]);
  const occurrences = recurring.flatMap(({ rrule, startsAt }) =>
    expandOccurrences({ rrule, dtstart: startsAt, from: before, to: before, lookbehind: limit }),
  );
  return [...instants, ...occurrences];
}

/**
 * range に掛かる暦日の回を 1 回 1 件の項目にしたもの（`placeOnce`。キーワードはタイトルかメモの部分一致）。
 * 範囲より前に始まった予定や、日時を持たないタスクも含むので、どれを出すかは呼び出し側が行の日時で決める
 */
export async function listTimelineItems(
  range: InstantRange,
  q: string | undefined,
  now: Date = new Date(),
): Promise<CalendarItem[]> {
  const days = {
    from: toDateString(range.from),
    to: toDateString(new Date(range.to.getTime() - 1)),
  };
  const keyword = q?.trim().toLowerCase() ?? '';
  const matches = (text: string | null) => text?.toLowerCase().includes(keyword) ?? false;
  return (await listOccurrences(days, now))
    .filter((o) => keyword === '' || matches(o.title) || matches(o.note))
    .flatMap((o) => placeOnce(o, now) ?? []);
}
