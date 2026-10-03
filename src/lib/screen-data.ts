import {
  hashKey,
  keepPreviousData,
  type QueriesOptions,
  type QueryKey,
  type UseInfiniteQueryOptions,
  type UseQueryOptions,
  type UseQueryResult,
  useInfiniteQuery,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { today } from '../../shared/date.ts';
import {
  type HistoryPages,
  type HistorySource,
  historyQueryOptions,
  splitAtToday,
} from './history.ts';

/**
 * 画面のデータの取得と配信。サーバーの状態は TanStack Query のキャッシュ（store）に 1 つだけ置き、
 * 取得を決める所と、読む所を分ける。
 *
 * - **取得**は画面（ルート。`src/routes/**`）が 1 か所で決める（`useScreenQueries` / `useScreenHistory`）。
 *   画面で読むクエリをすべてここで購読し、画面を開いている間の取り直し（画面に入ったとき・フォーカス・
 *   再接続・書き込みの後）はこの購読が受け持つ。1 つの画面の取得は同じ描画で一斉に始まるので、
 *   まとめて 1 本の要求で届く。
 * - **配信**: 部品は store から読むだけで、自分では取得を始めない（`useStoreQuery` ほか。取得を
 *   止めた購読 `enabled: false` なので、キャッシュが変われば描き直されるが、問い合わせは出ない）。
 *   画面が購読していないクエリを読むと、骨組みのまま出続ける。
 * - 利用者の操作で読み足すもの（古いほうのページ、繰り返しの予定の繰り返し元）は、操作の中で読む
 *   （`useScreenHistory` の `loadEarlier`、各 feature の `load*`）。書き込みと同じく操作が起こす取得。
 *
 * どちらも TanStack Query の購読をこのファイルだけが使う（lint: `lint/screen-data.grit`）。
 * WHY: 部品が自分でクエリを出すと、同じ画面の取得があちこちの部品に散らばり、何を読む画面なのかを
 * 画面から読み取れず、部品を描く・描かないで問い合わせが増減する。
 */

/**
 * 画面が読むクエリを購読する（取り直しはこの購読が起こす）。画面（ルート）からだけ呼ぶ。
 * 結果は返さない。部品は store から読む（`useStoreQuery` など）。
 */
export function useScreenQueries<T extends unknown[]>(
  queries: readonly [...QueriesOptions<T>],
): void {
  useQueries({ queries });
}

/**
 * 画面が読む履歴を購読し、読んだページを古い順に繋いだ全部と、それを一覧の最初の位置より上（above）と
 * そこから下（below）に分けて画面に出す順（出どころが `oldestFirst` なら古い順、そうでなければ新しい順）に並べた物を返す。
 * 古い側の端へ近づいたら古いほうのページを読む（`HistoryList` にそのまま渡せる形）。画面（ルート）からだけ呼ぶ。
 * - 絞り込みを変えたら、取り直せるまで前の結果を出したままにする（打つたびに骨組みへ戻さない）
 * - resetKey は取得のキーで、変わったら一覧を最初の位置（`HistoryList`）へ戻す合図。ready は出している結果が
 *   そのキーの物か（前の結果を出している間は位置を決めない）
 * - 画面を離れるときは最新のページだけを残す。取り直し（画面に入ったとき・書き込みの後）は
 *   読んだページをすべて順に読み直すので、遡った分を残すと以後ずっとその回数だけ問い合わせる
 */
export function useScreenHistory<T, F extends object>(source: HistorySource<T, F>, filter: F) {
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
  // pages[0] が最新のページ。各ページの中は古い順なので、ページを逆に並べて繋ぐ。
  // 画面は入力のたびに描き直されるので、読んだページか日付が変わったときだけ繋ぎ直す
  const day = today();
  // biome-ignore lint/correctness/useExhaustiveDependencies: source は機能ごとに 1 つの定数。day は今日で分け直す合図
  const joined = useMemo(() => {
    const items = data?.pages.toReversed().flatMap((page) => page.items);
    if (!items) return undefined;
    // 最初の位置は今日。古い順なら今日から下が先の日、新しい順なら今日から下が過ぎた日になる
    const { past, future } = splitAtToday(items, source.dayOf, source.oldestFirst);
    const [above, below] = source.oldestFirst
      ? [past, future]
      : [future.toReversed(), past.toReversed()];
    // items は分けない全部（古い順）。今日で分けずに扱う所（タイムライン、立替の金額の列の幅）が繋ぎ直さずに済む
    return { items, above, below };
  }, [data, day]);
  return {
    query: { data: joined, error },
    oldestFirst: source.oldestFirst ?? false,
    resetKey,
    ready: data !== undefined && !isPlaceholderData,
    /** 古いほうのページを読む。読み込み中・読み切ったときは null（`EdgeLoader`） */
    loadEarlier:
      hasNextPage && !isFetchingNextPage && !isPlaceholderData ? () => void fetchNextPage() : null,
  };
}

/** 画面が読む履歴の状態（`useScreenHistory` の返り値） */
export type ScreenHistory<T> = ReturnType<typeof useScreenHistory<T, object>>;

/** store から 1 つのクエリを読む。取得は始めない（画面が購読している前提） */
export function useStoreQuery<
  TQueryFnData,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(options: UseQueryOptions<TQueryFnData, Error, TData, TQueryKey>): UseQueryResult<TData, Error> {
  return useQuery({ ...options, enabled: false });
}

/** store から並んだクエリを読み、combine でまとめる。取得は始めない */
export function useStoreQueries<TQueryFnData, TCombined, TQueryKey extends QueryKey = QueryKey>(
  queries: readonly UseQueryOptions<TQueryFnData, Error, TQueryFnData, TQueryKey>[],
  combine: (results: UseQueryResult<TQueryFnData, Error>[]) => TCombined,
): TCombined {
  return useQueries({
    queries: queries.map((query) => ({ ...query, enabled: false })),
    combine,
  });
}

/** store からページで読むクエリ（履歴）を読む。取得は始めない */
export function useStoreInfiniteQuery<TPage, TData, TPageParam>(
  options: UseInfiniteQueryOptions<TPage, Error, TData, QueryKey, TPageParam>,
) {
  return useInfiniteQuery({ ...options, enabled: false });
}
