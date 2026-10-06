import { queryOptions } from '@tanstack/react-query';
import { type MoneyTransaction, sortTransactions } from '../../../shared/money.ts';
import type { TransactionFilter } from '../../../shared/validation/money.ts';
import { api } from '../../lib/api.ts';
import type { HistorySource } from '../../lib/history.ts';

/** 形はサーバーと共有する（shared/money.ts） */
export type { MoneyAccount, MoneyTransaction } from '../../../shared/money.ts';

const MONEY_QUERY_KEY = ['money'] as const;

/**
 * お金の画面のカード（口座の残高・評価額とカードの次回の引き落とし）。並びはサーバーの環境変数に書いた順。
 * 画面からは書かない（Money Forward から日に 1 度取り込む）ので、楽観的更新は無い
 */
export const accountsQueryOptions = queryOptions({
  queryKey: [...MONEY_QUERY_KEY, 'accounts'],
  queryFn: ({ signal }) => api.money.accounts.query(undefined, { signal }),
});

/**
 * 入出金の履歴（`src/lib/history.ts`。画面は `useScreenHistory` で購読する）。絞り込みはサーバーが掛ける
 * （手元にあるのは読んだページだけなので、手元では絞り込めない）。
 */
export const transactionHistory: HistorySource<MoneyTransaction, TransactionFilter> = {
  key: [...MONEY_QUERY_KEY, 'transactions'],
  fetch: (filter, before, signal) =>
    api.money.transactions.query({ ...filter, before }, { signal }),
  dayOf: (transaction) => transaction.occurredOn,
  sort: sortTransactions,
};
