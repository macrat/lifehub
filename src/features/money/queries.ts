import { queryOptions } from '@tanstack/react-query';
import {
  type MoneyBalance,
  type MoneyEntry,
  moneyEntryDay,
  sortBalances,
  sortMoneyEntries,
} from '../../../shared/money.ts';
import type { ExpenseFilter } from '../../../shared/validation/expenses.ts';
import type { MoneyRule } from '../../../shared/validation/money.ts';
import { api, write } from '../../lib/api.ts';
import type { HistorySource } from '../../lib/history.ts';
import { useOptimisticMutation } from '../../lib/query-client.ts';
import { recordWriteKeys } from '../timeline/queries.ts';

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
  fetch: (filter, before, signal) => api.expenses.list.query({ ...filter, before }, { signal }),
  dayOf: moneyEntryDay,
  sort: sortMoneyEntries,
};

/**
 * 口座の値の推移（残高の推移のグラフ）。1 ページは 3 か月で、古いほうはグラフを過去へ動かしたときに読み足す
 * （`useBalanceChart`）。今取り込んでいる口座すべての物を読み、どの口座を出すかは画面が選ぶ（選び直しても読み直さない）
 */
export const balanceHistory: HistorySource<MoneyBalance, Record<string, never>> = {
  key: [...MONEY_QUERY_KEY, 'balances'],
  fetch: (_filter, before, signal) => api.money.balances.query({ before }, { signal }),
  dayOf: (balance) => balance.on,
  sort: sortBalances,
  oldestFirst: true,
};

/** 入出金の読み替えのルール（上から順。管理画面の「入出金のルール」） */
export const rulesQueryOptions = queryOptions({
  queryKey: [...MONEY_QUERY_KEY, 'rules'],
  queryFn: ({ signal }) => api.money.rules.query(undefined, { signal }),
});

/**
 * ルールの並び全体を保存する。サーバーは取り込み済みの入出金を読み替え直すので、一覧・精算の元の合計（立替の
 * `expenses` のクエリ）・タイムラインも取り直す。読み替えの結果は先回りしない（当て直しはサーバーだけが持つ）
 */
export function useSaveRules() {
  return useOptimisticMutation<MoneyRule[]>({
    request: write.money.saveRules,
    keys: recordWriteKeys(rulesQueryOptions.queryKey, moneyHistory.key, ['expenses']),
    apply: (client, rules) => {
      client.setQueryData(rulesQueryOptions.queryKey, rules);
    },
  });
}
