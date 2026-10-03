import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';
import { today } from '../../shared/date.ts';
import { isFiltered } from '../../shared/search.ts';
import type { HistoryPage } from '../../shared/types.ts';

/**
 * 履歴（立替・レモンの記録）の、サーバーから読んだページ。pages[0] が最新のページで、各ページの中は古い順
 * （shared/types.ts の `HistoryPage`）。古いほうのページは一覧の古い側の端で足す（`src/lib/screen-data.ts` の `useScreenHistory`）。
 */
export type HistoryPages<T> = InfiniteData<HistoryPage<T>>;

/** 履歴の出どころ。機能ごとに 1 つ定め、読む・書き込む処理はすべてこれを受け取る */
export type HistorySource<T, F> = {
  /** キャッシュのキーの頭。絞り込みごとのキーは `[...key, 絞り込み]` */
  key: QueryKey;
  /** 絞り込みと before（省けば最新）で 1 ページを取る */
  fetch: (filter: F, before: string | undefined, signal: AbortSignal) => Promise<HistoryPage<T>>;
  /** 記録の日（JST の暦日）。ページはこの日で区切られている */
  dayOf: (item: T) => string;
  /** 1 ページの中の並び（古い順） */
  sort: (items: T[]) => T[];
  /**
   * 一覧を上から古い順に並べる（天気）。今日の記録は未来の側に入り、最初の位置は今日の頭（画面の一番上）で、
   * 過ぎた日はその上に続く。
   * 省くと上から新しい順（立替・レモン。ホームのタイムラインと同じ向き）。今日の記録は過去の側に入り、
   * 最初の位置は今日の最新の記録（画面の一番上）で、未来の日付の記録はその上に続く
   */
  oldestFirst?: boolean;
};

/**
 * 絞り込みごとのクエリの設定。絞り込んだ結果は打つたびに別のキーになるので、
 * 既定（7 日）のまま端末に溜めない。最新のページだけを読む所（ホームの天気のタイル）も、
 * 同じキャッシュを読むようこれを使う。
 */
export function historyQueryOptions<T, F extends object>(source: HistorySource<T, F>, filter: F) {
  const filtered = isFiltered(filter);
  return {
    queryKey: [...source.key, filter],
    queryFn: ({ pageParam, signal }: { pageParam: string | undefined; signal: AbortSignal }) =>
      source.fetch(filter, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: HistoryPage<T>) => last.nextCursor ?? undefined,
    ...(filtered ? { gcTime: 1000 * 60 } : {}),
  };
}

/**
 * 古い順の記録を、今日（JST）までと未来に分ける（todayInFuture なら、昨日までと今日から）。未来の記録は末尾に
 * まとまっているので、境目を 1 か所探して切る（記録ごとに日を 2 回ずつ求めない）
 */
export function splitAtToday<T>(
  items: T[],
  dayOf: (item: T) => string,
  todayInFuture = false,
): { past: T[]; future: T[] } {
  const now = today();
  const index = items.findIndex((item) => (todayInFuture ? dayOf(item) >= now : dayOf(item) > now));
  return index < 0
    ? { past: items, future: [] }
    : { past: items.slice(0, index), future: items.slice(index) };
}

/** 読んだページのどこかにある記録（編集・削除の前の値） */
export function findInHistories<T extends { id: string }, F>(
  client: QueryClient,
  source: HistorySource<T, F>,
  id: string,
): T | undefined {
  for (const [, data] of client.getQueriesData<HistoryPages<T>>({ queryKey: source.key })) {
    const found = data?.pages.flatMap((page) => page.items).find((item) => item.id === id);
    if (found) return found;
  }
  return undefined;
}

/**
 * 記録 1 件の変化（id の記録が next になる。削除は null）を、読んだ履歴に先回りして書き込む（楽観的更新）。
 * - どの絞り込みの履歴からも id の記録を除く（消えた物はどの絞り込みにも合わない）
 * - next は絞り込みの無い履歴にだけ入れる。絞り込みに合うかはサーバーが決めるので、
 *   絞り込んだ履歴は書き込み後の取り直し（invalidate）に任せる
 */
export function applyToHistories<T extends { id: string }, F>(
  client: QueryClient,
  source: HistorySource<T, F>,
  id: string,
  next: T | null,
): void {
  client.setQueriesData<HistoryPages<T>>({ queryKey: source.key }, (data) =>
    data?.pages.some((page) => page.items.some((item) => item.id === id))
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => item.id !== id),
          })),
        }
      : data,
  );
  if (next) {
    client.setQueryData<HistoryPages<T>>([...source.key, {}], (data) =>
      data ? withItem(data, next, source) : data,
    );
  }
}

/**
 * 記録の日が収まるページに入れる。各ページは nextCursor の日以降（null なら最も古い日まで）を持つので、
 * 新しいほうから見て最初に収まるページ。まだ読んでいない古い日なら入れない（読んだときに出る）。
 */
function withItem<T, F>(
  data: HistoryPages<T>,
  item: T,
  source: HistorySource<T, F>,
): HistoryPages<T> {
  const day = source.dayOf(item);
  const index = data.pages.findIndex((page) => page.nextCursor === null || day >= page.nextCursor);
  if (index < 0) return data;
  return {
    ...data,
    pages: data.pages.map((page, i) =>
      i === index ? { ...page, items: source.sort([...page.items, item]) } : page,
    ),
  };
}
