import { queryOptions } from '@tanstack/react-query';
import { type MoneyEntry, moneyEntryDay, sortMoneyEntries } from '../../../shared/money.ts';
import type { ExpenseFilter } from '../../../shared/validation/expenses.ts';
import { api } from '../../lib/api.ts';
import type { HistorySource } from '../../lib/history.ts';

/** 形はサーバーと共有する（shared/money.ts） */
export type { MoneyAccount, MoneyEntry, MoneyTransaction } from '../../../shared/money.ts';

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
 * お金の画面の一覧: 立替と取り込んだ入出金を 1 本に並べた履歴（`src/lib/history.ts`。画面は `useScreenHistory` で
 * 購読する）。絞り込みは立替の一覧と同じ条件で、サーバーが掛ける（手元にあるのは読んだページだけなので、手元では絞り込めない）。
 * 立替の書き込みはここへ先回りして書く（`src/features/expenses/queries.ts`）。
 */
export const moneyHistory: HistorySource<MoneyEntry, ExpenseFilter> = {
  key: [...MONEY_QUERY_KEY, 'list'],
  fetch: (filter, before, signal) => api.money.list.query({ ...filter, before }, { signal }),
  dayOf: moneyEntryDay,
  sort: sortMoneyEntries,
};
