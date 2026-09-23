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
export type HistoryPages<T> = InfiniteData<HistoryPage<T>>;

type HistoryOptions<T> = {
  queryKey: QueryKey;
  queryFn: (context: { pageParam: string | undefined }) => Promise<HistoryPage<T>>;
  /** 絞り込んでいるか（`isFiltered`）。絞り込んだ結果は 1 分で捨てる */
  filtered: boolean;
};

/** 絞り込みの値のどれかが入っているか */
export function isFiltered(filter: Record<string, unknown>): boolean {
  return Object.values(filter).some((value) => value !== undefined);
}

/**
 * 履歴のクエリの設定（取得・書き込みの両方が同じキーと形を使う）。
 * 絞り込んだ結果は打つたびに別のキーになるので、既定（7 日）のまま端末に溜めない。
 */
export function historyQueryOptions<T>({ queryKey, queryFn, filtered }: HistoryOptions<T>) {
  return {
    queryKey,
    queryFn,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: HistoryPage<T>) => last.nextCursor ?? undefined,
    ...(filtered ? { gcTime: 1000 * 60 } : {}),
  };
}

/**
 * 画面が読む履歴。読んだページを古い順に繋いで返し、上の端へ近づいたら古いほうのページを読む
 * （`InfiniteScroll` にそのまま渡せる形）。
 * - 絞り込みを変えたら、取り直せるまで前の結果を出したままにする（打つたびに骨組みへ戻さない）
 * - resetKey は取得のキーで、変わったら一覧を一番下（最新）へ戻す合図。ready は出している結果が
 *   そのキーの物か（前の結果を出している間は位置を決めない）
 * - 画面を離れるときは最新のページだけを残す。取り直し（画面に入ったとき・書き込みの後）は
 *   読んだページをすべて順に読み直すので、遡った分を残すと以後ずっとその回数だけ問い合わせる
 */
export function useHistory<T>(options: ReturnType<typeof historyQueryOptions<T>>) {
  const queryClient = useQueryClient();
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
    resetKey,
    ready: data !== undefined && !isPlaceholderData,
    loadEarlier:
      hasNextPage && !isFetchingNextPage && !isPlaceholderData
        ? () => void fetchNextPage()
        : undefined,
  };
}

/** 読んだページのどこかにある記録（編集・削除の前の値） */
export function findInHistories<T extends { id: string }>(
  client: QueryClient,
  queryKey: QueryKey,
  id: string,
): T | undefined {
  for (const [, data] of client.getQueriesData<HistoryPages<T>>({ queryKey })) {
    const found = data?.pages.flatMap((page) => page.items).find((item) => item.id === id);
    if (found) return found;
  }
  return undefined;
}

/**
 * 記録 1 件の変化を、読んだ履歴に先回りして書き込む（楽観的更新）。
 * - どの絞り込みの履歴からも id の記録を除く（消えた物はどの絞り込みにも合わない）
 * - next があれば、絞り込みの無い履歴（unfilteredKey）にだけ入れる。絞り込みに合うかはサーバーが
 *   決めるので、絞り込んだ履歴は書き込み後の取り直し（invalidate）に任せる
 */
export function applyToHistories<T extends { id: string }>(
  client: QueryClient,
  { queryKey, unfilteredKey }: { queryKey: QueryKey; unfilteredKey: QueryKey },
  id: string,
  next: { item: T; day: string; sort: (items: T[]) => T[] } | null,
): void {
  client.setQueriesData<HistoryPages<T>>({ queryKey }, (data) =>
    data ? withoutItem(data, id) : data,
  );
  if (next) {
    client.setQueryData<HistoryPages<T>>(unfilteredKey, (data) =>
      data ? withItem(data, next.item, next.day, next.sort) : data,
    );
  }
}

function withoutItem<T extends { id: string }>(data: HistoryPages<T>, id: string) {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.id !== id),
    })),
  };
}

/**
 * day（その記録の JST の暦日）が収まるページに入れる。各ページは nextCursor の日以降（null なら最も古い日まで）を
 * 持つので、新しいほうから見て最初に収まるページ。まだ読んでいない古い日なら入れない（読んだときに出る）。
 */
function withItem<T>(
  data: HistoryPages<T>,
  item: T,
  day: string,
  sort: (items: T[]) => T[],
): HistoryPages<T> {
  const index = data.pages.findIndex((page) => page.nextCursor === null || day >= page.nextCursor);
  if (index < 0) return data;
  return {
    ...data,
    pages: data.pages.map((page, i) =>
      i === index ? { ...page, items: sort([...page.items, item]) } : page,
    ),
  };
}
