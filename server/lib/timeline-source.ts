import type { InstantRange } from '../../shared/date.ts';
import type { TimelineEntry } from '../../shared/timeline.ts';

/**
 * タイムライン（`features/timeline`）が 1 つの feature から記録を集める口。各 feature の service が 1 つずつ持ち、
 * タイムラインはそれを並べるだけにする（どの記録をどの日時に置くかは各 feature と shared/timeline.ts が決める）。
 */
export type TimelineSource = {
  /** 置く日時が before より前の、新しいほうから（少なくとも）limit 件の日時（ページの区切りを決める）。並びは問わない */
  recentInstants(before: Date, q: string | undefined, limit: number): Promise<Date[]>;
  /** range に掛かる記録の行。どの行を出すかはタイムラインが行の日時で決める */
  entries(range: InstantRange, q: string | undefined, now: Date): Promise<TimelineEntry[]>;
};

/**
 * 1 件の記録が 1 つの日時に置かれる feature の `TimelineSource`。repository の問い合わせ
 * （`lib/db/timeline.ts` の `timelineQueries`）が返す行を、toEntry でタイムラインの行にするだけ。
 */
export function recordTimelineSource<Row>(
  queries: {
    findRecentInstants: TimelineSource['recentInstants'];
    findInRange(range: InstantRange, q: string | undefined): Promise<Row[]>;
  },
  toEntry: (row: Row) => TimelineEntry,
): TimelineSource {
  return {
    recentInstants: queries.findRecentInstants,
    entries: async (range, q) => (await queries.findInRange(range, q)).map(toEntry),
  };
}
