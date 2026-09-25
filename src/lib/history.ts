import {
  hashKey,
  type InfiniteData,
  keepPreviousData,
  type QueryClient,
  type QueryKey,
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import type { HistoryPage } from '../../shared/types.ts';

/**
 * 履歴（立替・レモンの記録）の、サーバーから読んだページ。pages[0] が最新のページで、各ページの中は古い順
 * （shared/types.ts の `HistoryPage`）。上へスクロールすると古いほうのページを足す（`fetchNextPage`）。
 */
type HistoryPages<T> = InfiniteData<HistoryPage<T>>;

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
};

/**
 * 絞り込みごとのクエリの設定。絞り込んだ結果は打つたびに別のキーになるので、
 * 既定（7 日）のまま端末に溜めない。
 */
function historyQueryOptions<T, F extends object>(source: HistorySource<T, F>, filter: F) {
  const filtered = Object.values(filter).some((value) => value !== undefined);
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
 * 画面が読む履歴。読んだページを古い順に繋いで返し、上の端へ近づいたら古いほうのページを読む
 * （`HistoryList` にそのまま渡せる形）。dayOf は、一覧が今日までと未来の記録を分けるのに使う。
 * - 絞り込みを変えたら、取り直せるまで前の結果を出したままにする（打つたびに骨組みへ戻さない）
 * - resetKey は取得のキーで、変わったら一覧を最初の位置（今日の記録が一番下）へ戻す合図。ready は出している結果が
 *   そのキーの物か（前の結果を出している間は位置を決めない）
 * - 画面を離れるときは最新のページだけを残す。取り直し（画面に入ったとき・書き込みの後）は
 *   読んだページをすべて順に読み直すので、遡った分を残すと以後ずっとその回数だけ問い合わせる
 */
export function useHistory<T, F extends object>(source: HistorySource<T, F>, filter: F) {
  const queryClient = useQueryClient();
  const options = historyQueryOptions(source, filter);
  const { data, error, hasNextPage, isFetchingNextPage, isPlaceholderData, fetchNextPage } =
    useInfiniteQuery({ ...options, placeholderData: keepPreviousData });
  const resetKey = hashKey(options.queryKey);
  // biome-ignore lint/correctness/useExhaustiveDependencies: キーが同じなら同じキャッシュを指す
  useEffect(
    () => () => {
      queryClient.setQueryData<HistoryPages<T>>(
        options.queryKey,
        (prev) =>
          prev && { pages: prev.pages.slice(0, 1), pageParams: prev.pageParams.slice(0, 1) },
      );
    },
    [queryClient, resetKey],
  );
  return {
    // pages[0] が最新のページ。各ページの中は古い順なので、ページを逆に並べて繋ぐ
    query: { data: data?.pages.toReversed().flatMap((page) => page.items), error },
    dayOf: source.dayOf,
    resetKey,
    ready: data !== undefined && !isPlaceholderData,
    loadEarlier:
      hasNextPage && !isFetchingNextPage && !isPlaceholderData
        ? () => void fetchNextPage()
        : undefined,
  };
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
