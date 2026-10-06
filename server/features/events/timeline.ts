import { placeOnce } from '../../../shared/calendar.ts';
import { inclusiveEndDate, toDateString } from '../../../shared/date.ts';
import { eventEntry } from '../../../shared/timeline.ts';
import { expandOccurrences } from '../../lib/recurrence/index.ts';
import type { TimelineSource } from '../../lib/timeline-source.ts';
import { listOccurrences } from './occurrences.ts';
import * as repository from './repository.ts';

/**
 * ホームのタイムライン（`features/timeline`）に予定・タスクを渡す口。
 * 行を置く日時の規則は shared/timeline.ts の `eventEntry` が持ち、ここは回を展開して渡すだけにする。
 */

/**
 * 予定・タスクの `TimelineSource`。tasksOf を渡すと、タスクはその人が参加者にいるものだけにする（予定は絞らない）。
 * タイムラインが自分以外のタスクを出さないときに使う。
 */
export function timelineSource(tasksOf?: string): TimelineSource {
  return {
    /**
     * タイムラインのページ分け: 日時が before より前の、新しいほうから（少なくとも）limit 件の日時。
     * 単発の行と実体化された回は DB で絞り、繰り返す予定は繰り返し元ごとに before の直前の limit 回を展開する。
     * 並びは問わない（呼び出し側がほかの記録と合わせて並べる）。
     * 繰り返す予定は予定だけなので、tasksOf では絞らない
     */
    async recentInstants(before, q, limit) {
      const [instants, recurring] = await Promise.all([
        repository.findRecentTimelineInstants(before, q, limit, tasksOf),
        repository.findRecurringEventsBefore(before, q),
      ]);
      const occurrences = recurring.flatMap(({ rrule, startsAt }) =>
        expandOccurrences({
          rrule,
          dtstart: startsAt,
          from: before,
          to: before,
          lookbehind: limit,
        }),
      );
      return [...instants, ...occurrences];
    },

    /**
     * range に掛かる暦日の回を 1 回 1 件の行にしたもの（`placeOnce`。キーワードはタイトルかメモの部分一致）。
     * 範囲より前に始まった予定や、今日へ繰り越したタスクも含むので、どれを出すかは呼び出し側が行の日時で決める
     */
    async entries(range, q, now) {
      const days = { from: toDateString(range.from), to: inclusiveEndDate(range.to.toISOString()) };
      return (await listOccurrences(days, now, { q, tasksOf }))
        .map((o) => placeOnce(o, now))
        .map((item) => eventEntry(item, now));
    },
  };
}
