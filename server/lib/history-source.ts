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

/**
 * 履歴（立替・レモンの記録・お金の画面の一覧）の 1 ページの件数の目安。ページは日の途中では切らないので、
 * これより多くなることがある。1 日は数件なので、スマホの画面数枚分になる
 */
export const HISTORY_PAGE_SIZE = 50;

/**
 * 出どころの行（repository の `historyQueries` の行や、別の `HistorySource` の記録）を、toRecord で履歴の行にした `HistorySource`
 */
export function mapHistorySource<Row, T>(
  source: HistorySource<Row>,
  toRecord: (row: Row) => T,
): HistorySource<T> {
  return {
    recentDays: source.recentDays,
    hasBefore: source.hasBefore,
    findInDays: async (from, before) => (await source.findInDays(from, before)).map(toRecord),
  };
}

/**
 * いくつかの出どころの記録を 1 本に並べた履歴の 1 ページ。分け方は 1 つの表の履歴と同じで、before より前の、
 * 新しいほうから HISTORY_PAGE_SIZE 件ほどを入れ、最も古い日の途中では切らない（その日の記録はすべて入れる）。
 * 出どころごとに新しいほうから HISTORY_PAGE_SIZE 件の日を集め、全体で HISTORY_PAGE_SIZE 件目の日からをこのページにする。
 * 並びは呼ぶ側が決める（items は出どころの順につないだだけ）。
 */
export async function mergeHistoryPage<T>(
  sources: HistorySource<T>[],
  before: DateString | undefined,
): Promise<HistoryPage<T>> {
  const days = (
    await Promise.all(sources.map((source) => source.recentDays(before, HISTORY_PAGE_SIZE)))
  )
    .flat()
    .sort()
    .reverse();
  // 全体で HISTORY_PAGE_SIZE 件目の日から。それが無ければ残りすべて
  const boundary = days[HISTORY_PAGE_SIZE - 1];
  const [items, older] = await Promise.all([
    Promise.all(sources.map((source) => source.findInDays(boundary, before))),
    boundary ? Promise.all(sources.map((source) => source.hasBefore(boundary))) : [],
  ]);
  return {
    items: items.flat(),
    nextCursor: boundary && older.some(Boolean) ? boundary : null,
  };
}
