import { type QueryClient, queryOptions } from '@tanstack/react-query';
import {
  type Expense,
  type ExpenseSchedule,
  type ExpenseTotal,
  type Settlement,
  settlementsOf,
} from '../../../shared/expenses.ts';
import { expenseMoneyEntry, moneyEntryId } from '../../../shared/money.ts';
import type { ExpenseInput, ExpenseScheduleInput } from '../../../shared/validation/expenses.ts';
import { api, write } from '../../lib/api.ts';
import { applyToHistories, findInHistories } from '../../lib/history.ts';
import {
  type QueryState,
  useCreateMutation,
  useOptimisticMutation,
} from '../../lib/query-client.ts';
import { useStoreQuery } from '../../lib/screen-data.ts';
import { moneyHistory } from '../money/queries.ts';
import { recordWriteKeys, timelineRecordCache } from '../timeline/queries.ts';

/** 行と精算の形はサーバーと共有する（楽観的更新もこの形で導く。shared/expenses.ts） */
export type { Expense, ExpenseSchedule, Settlement } from '../../../shared/expenses.ts';

const EXPENSES_QUERY_KEY = ['expenses'] as const;

/** 書き込みが変えるクエリ（立替の合計、お金の画面の一覧、全機能の記録を並べるタイムライン） */
const WRITE_KEYS = recordWriteKeys(EXPENSES_QUERY_KEY, moneyHistory.key);

const timelineCache = timelineRecordCache('expense');

/**
 * お金の画面の一覧（立替と入出金を 1 本に並べた `moneyHistory`）とタイムラインへの先回りの読み書き。
 * - find: 編集・削除の前の値。まずお金の画面の一覧を探し、無ければタイムラインを見る
 * - apply: 立替 1 件の変化（削除は null）を、一覧の行（`expenseMoneyEntry`）とタイムラインに書き込む
 */
const expenseCache = {
  find: (client: QueryClient, id: string): Expense | undefined => {
    const entry = findInHistories(client, moneyHistory, moneyEntryId('expense', id));
    return entry?.type === 'expense' ? entry.expense : timelineCache.find(client, id);
  },
  apply: (client: QueryClient, id: string, next: Expense | null): void => {
    applyToHistories(
      client,
      moneyHistory,
      moneyEntryId('expense', id),
      next && expenseMoneyEntry(next),
    );
    timelineCache.apply(client, id, next);
  },
};

/** 精算の元になる「誰が誰のために払ったか」ごとの合計（shared/expenses.ts の `settlementsOf` が読む形） */
export const totalsQueryOptions = queryOptions({
  queryKey: [...EXPENSES_QUERY_KEY, 'totals'],
  queryFn: ({ signal }): Promise<ExpenseTotal[]> =>
    api.expenses.totals.query(undefined, { signal }),
});

/** 立替を帳消しにする資金移動。サーバーの合計から導く（式はサーバーと同じ `settlementsOf`）。立替ページが読む */
export function useSettlements(): QueryState<Settlement[]> {
  const totals = useStoreQuery(totalsQueryOptions);
  return { data: totals.data && settlementsOf(totals.data), error: totals.error };
}

/** 立替スケジュール（作った順）。設定の「立替スケジュール」が読む */
export const expenseSchedulesQueryOptions = queryOptions({
  queryKey: [...EXPENSES_QUERY_KEY, 'schedules'],
  queryFn: ({ signal }): Promise<ExpenseSchedule[]> =>
    api.expenses.schedules.query(undefined, { signal }),
});

/** スケジュールの並びに 1 件の変化（id のスケジュールが next になる。削除は null。追加は末尾）を先回りして書く */
function applySchedule(client: QueryClient, id: string, next: ExpenseSchedule | null): void {
  client.setQueryData(expenseSchedulesQueryOptions.queryKey, (list) => {
    if (!list) return list;
    if (!list.some((schedule) => schedule.id === id)) return next ? [...list, next] : list;
    return list.flatMap((schedule) => (schedule.id !== id ? [schedule] : next ? [next] : []));
  });
}

/**
 * 立替スケジュールを作る。最初の日が今日までなら、サーバーがその場で立替も記録するので、一覧・精算・タイムラインも取り直す
 * （記録される立替は先回りして書かない。回の日の数え方はサーバーと同じだが、ID はサーバーが決める）
 */
export function useAddExpenseSchedule() {
  return useCreateMutation<ExpenseScheduleInput>({
    request: write.expenses.createSchedule,
    keys: WRITE_KEYS,
    apply: (client, { id, spentOn, ...input }) => {
      applySchedule(client, id, { ...input, id, startsOn: spentOn });
    },
  });
}

/** 立替スケジュールを書き換える。まだ記録していない回にだけ効くので、記録した立替は変わらない */
export function useUpdateExpenseSchedule() {
  return useOptimisticMutation<ExpenseScheduleInput & { id: string }>({
    request: write.expenses.updateSchedule,
    keys: [expenseSchedulesQueryOptions.queryKey],
    apply: (client, { id, spentOn, ...input }) => {
      applySchedule(client, id, { ...input, id, startsOn: spentOn });
    },
  });
}

/** 立替スケジュールを消す。記録した立替は残る */
export function useDeleteExpenseSchedule() {
  return useOptimisticMutation({
    request: (id: string) => write.expenses.deleteSchedule({ id }),
    keys: [expenseSchedulesQueryOptions.queryKey],
    apply: (client, id) => applySchedule(client, id, null),
  });
}

/**
 * 追加と編集は同じ形（`ExpenseInput`。編集は全項目を置き換える）。フォームが検証した値（スキーマの出力）で、
 * 送る JSON としてもそのまま使える。日付は印の付いた DateString なので、楽観的更新で作る行の型
 * （`Expense`）と一致する。
 */
export function useAddExpense() {
  return useCreateMutation<ExpenseInput>({
    request: write.expenses.create,
    keys: WRITE_KEYS,
    apply: (client, input) => {
      applyChange(client, input.id, null, { ...input, createdAt: new Date().toISOString() });
    },
  });
}

export function useUpdateExpense() {
  return useOptimisticMutation<ExpenseInput & { id: string }>({
    request: write.expenses.update,
    keys: WRITE_KEYS,
    apply: (client, { id, ...input }) => {
      const prev = expenseCache.find(client, id);
      if (prev) applyChange(client, id, prev, { ...prev, ...input });
    },
  });
}

export function useDeleteExpense() {
  return useOptimisticMutation({
    request: (id: string) => write.expenses.delete({ id }),
    keys: WRITE_KEYS,
    apply: (client, id) => {
      const prev = expenseCache.find(client, id);
      if (prev) applyChange(client, id, prev, null);
    },
  });
}

/**
 * 1 件の変化（prev → next。追加は prev が null、削除は next が null）を先回りして書き込む。
 * - 合計: prev の分を引き、next の分を足す。精算は合計から導くので、サーバーと一致する
 * - 履歴とタイムライン: `timelineRecordCache` の apply
 */
function applyChange(
  client: QueryClient,
  id: string,
  prev: Expense | null,
  next: Expense | null,
): void {
  client.setQueryData(totalsQueryOptions.queryKey, (totals) => {
    if (!totals) return totals;
    const withoutPrev = prev ? addTotal(totals, prev, -1) : totals;
    return next ? addTotal(withoutPrev, next, 1) : withoutPrev;
  });
  expenseCache.apply(client, id, next);
}

function addTotal(totals: ExpenseTotal[], e: Expense, sign: 1 | -1): ExpenseTotal[] {
  const same = (t: ExpenseTotal) => t.fromUserId === e.fromUserId && t.toUserId === e.toUserId;
  const delta = sign * e.amount;
  return totals.some(same)
    ? totals.map((t) => (same(t) ? { ...t, amount: t.amount + delta } : t))
    : [...totals, { fromUserId: e.fromUserId, toUserId: e.toUserId, amount: delta }];
}
