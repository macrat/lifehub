import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import type { ExpenseFilter } from '../../../shared/validation/expenses.ts';
import type { QueryState } from '../../lib/query-client.ts';
import { type Expense, expensesQueryOptions } from './queries.ts';

/**
 * 立替画面の履歴。読んだページを古い順に繋いで返し、上の端へ近づいたら古いほうのページを読む。
 * 絞り込みを変えたら、取り直せるまで前の結果を出したままにする（打つたびに骨組みへ戻さない）。
 * shownFilterKey は出している結果の絞り込みで、変わったら一覧を一番下（最新）へ戻す合図になる。
 */
export function useExpenseHistory(filter: ExpenseFilter): {
  query: QueryState<Expense[]>;
  shownFilterKey: string;
  loadEarlier: (() => void) | undefined;
} {
  const { data, error, hasNextPage, isFetchingNextPage, isPlaceholderData, fetchNextPage } =
    useInfiniteQuery({ ...expensesQueryOptions(filter), placeholderData: keepPreviousData });
  return {
    // pages[0] が最新のページ。各ページの中は古い順なので、ページを逆に並べて繋ぐ
    query: { data: data?.pages.toReversed().flatMap((page) => page.items), error },
    shownFilterKey: data?.pages[0]?.filterKey ?? '',
    loadEarlier:
      hasNextPage && !isFetchingNextPage && !isPlaceholderData
        ? () => void fetchNextPage()
        : undefined,
  };
}
