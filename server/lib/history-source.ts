import type { DateString, HistoryPage } from '../../shared/types.ts';

/**
 * 1 本の履歴（shared/types.ts の `HistoryPage`）に記録を並べる、1 つの feature の記録の口。repository の問い合わせ
 * （`lib/db/history.ts` の `historyQueries`）の行を、service が履歴の行の形にして渡す。
 * 複数の feature の記録を 1 本に並べる画面（お金の画面の立替と入出金）が、どの feature の表も直接読まずに済むようにする。
 */
export type HistorySource<T> = {
  recentDays(before: DateString | undefined, limit: number): Promise<DateString[]>;
  findInDays(from: DateString | undefined, before: DateString | undefined): Promise<T[]>;
  hasBefore(day: DateString): Promise<boolean>;
};

/** 1 ページの件数の目安（1 つの表の履歴 `findHistoryPage` と同じ） */
const PAGE_SIZE = 50;

/**
 * いくつかの出どころの記録を 1 本に並べた履歴の 1 ページ。分け方は 1 つの表の履歴と同じで、before より前の、
 * 新しいほうから PAGE_SIZE 件ほどを入れ、最も古い日の途中では切らない（その日の記録はすべて入れる）。
 * 出どころごとに新しいほうから PAGE_SIZE 件の日を集め、全体で PAGE_SIZE 件目の日からをこのページにする。
 * 並びは呼ぶ側が決める（items は出どころの順につないだだけ）。
 */
export async function mergeHistoryPage<T>(
  sources: HistorySource<T>[],
  before: DateString | undefined,
): Promise<HistoryPage<T>> {
  const days = (await Promise.all(sources.map((source) => source.recentDays(before, PAGE_SIZE))))
    .flat()
    .sort()
    .reverse();
  // 全体で PAGE_SIZE 件目の日から。それが無ければ残りすべて
  const boundary = days[PAGE_SIZE - 1];
  const [items, older] = await Promise.all([
    Promise.all(sources.map((source) => source.findInDays(boundary, before))),
    boundary ? Promise.all(sources.map((source) => source.hasBefore(boundary))) : [],
  ]);
  return {
    items: items.flat(),
    nextCursor: boundary && older.some(Boolean) ? boundary : null,
  };
}
