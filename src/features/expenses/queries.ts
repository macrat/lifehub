import {
  type InfiniteData,
  infiniteQueryOptions,
  type QueryClient,
  queryOptions,
  useQuery,
} from '@tanstack/react-query';
import type { InferRequestType } from 'hono/client';
import {
  type Balance,
  balanceOf,
  type Expense,
  type ExpensePage,
  type ExpenseTotal,
  sortExpenses,
} from '../../../shared/expenses.ts';
import type { ExpenseFilter } from '../../../shared/validation/expenses.ts';
import { api, ensureOk } from '../../lib/api.ts';
import {
  type QueryState,
  useCreateMutation,
  useOptimisticMutation,
} from '../../lib/query-client.ts';
import { usersQueryOptions } from '../users/queries.ts';

/** 追加と編集で同じ形（編集は全項目を置き換える） */
export type ExpenseBody = InferRequestType<typeof api.expenses.$post>['json'];
/** 行と残高の形はサーバーと共有する（楽観的更新もこの形で導く。shared/expenses.ts） */
export type { Balance, Expense } from '../../../shared/expenses.ts';

const EXPENSES_QUERY_KEY = ['expenses'] as const;
const LIST_QUERY_KEY = [...EXPENSES_QUERY_KEY, 'list'] as const;

/**
 * 取得したページ。filterKey はどの絞り込みで取ったか: 絞り込みを変えた直後は取り直すまで前の結果を
 * 出したままにするので（`keepPreviousData`）、画面は出ている結果がどの絞り込みの物かをこれで知る
 */
type Page = ExpensePage & { filterKey: string };
type Pages = InfiniteData<Page>;

/**
 * 履歴（絞り込みごと）。サーバーが新しいほうから 1 ページずつ返し、上へスクロールすると
 * 古いほうのページを足す（`fetchNextPage`）。pages[0] が最新のページで、各ページの中は古い順。
 * 絞り込みはサーバーが掛ける（手元にあるのは読んだページだけなので、手元では絞り込めない）。
 */
export function expensesQueryOptions(filter: ExpenseFilter) {
  return infiniteQueryOptions({
    queryKey: [...LIST_QUERY_KEY, filter],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<Page> => {
      const query = {
        ...filter,
        min: filter.min?.toString(),
        max: filter.max?.toString(),
        before: pageParam,
      };
      const page = await (await ensureOk(await api.expenses.$get({ query }))).json();
      return { ...page, filterKey: JSON.stringify(filter) };
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** 絞り込みの無い履歴。追加・編集はこれにだけ先回りして書き込む（`applyChange`） */
const UNFILTERED: ExpenseFilter = {};

/** 残高の元になる「誰が誰のために払ったか」ごとの合計（shared/expenses.ts の `balanceOf` が読む形） */
const totalsQueryOptions = queryOptions({
  queryKey: [...EXPENSES_QUERY_KEY, 'totals'],
  queryFn: async (): Promise<ExpenseTotal[]> =>
    (await ensureOk(await api.expenses.totals.$get())).json(),
});

/**
 * 残高。サーバーの合計とユーザー（登録順の先頭 2 人が A, B。サーバーと同じ）から導く。
 * 立替ページとホームのカードが読む。
 */
export function useBalance(): QueryState<Balance> {
  const totals = useQuery(totalsQueryOptions);
  const users = useQuery(usersQueryOptions);
  const [a, b] = users.data ?? [];
  const pair = a && b && users.data?.length === 2 ? ([a.id, b.id] as [string, string]) : null;
  return {
    data: totals.data && pair ? balanceOf(totals.data, pair) : undefined,
    error:
      totals.error ??
      users.error ??
      (users.data && !pair ? new Error('立替の計算はユーザーが 2 人のときだけ行えます') : null),
  };
}

export function useAddExpense() {
  return useCreateMutation<ExpenseBody>({
    request: (input) => ({
      method: 'POST' as const,
      path: api.expenses.$url().pathname,
      body: input,
    }),
    keys: [EXPENSES_QUERY_KEY],
    apply: (client, input) => {
      applyChange(client, null, { ...input, createdAt: new Date().toISOString() });
    },
  });
}

export function useUpdateExpense() {
  return useOptimisticMutation({
    request: ({ id, ...input }: ExpenseBody & { id: string }) => ({
      method: 'PUT' as const,
      path: api.expenses[':id'].$url({ param: { id } }).pathname,
      body: input,
    }),
    keys: [EXPENSES_QUERY_KEY],
    apply: (client, { id, ...input }) => {
      const prev = findCached(client, id);
      if (prev) applyChange(client, prev, { ...prev, ...input });
    },
  });
}

export function useDeleteExpense() {
  return useOptimisticMutation({
    request: (id: string) => ({
      method: 'DELETE' as const,
      path: api.expenses[':id'].$url({ param: { id } }).pathname,
    }),
    keys: [EXPENSES_QUERY_KEY],
    apply: (client, id) => {
      const prev = findCached(client, id);
      if (prev) applyChange(client, prev, null);
    },
  });
}

/** 読んだページのどこかにある立替（編集・削除の前の値） */
function findCached(client: QueryClient, id: string): Expense | undefined {
  for (const [, data] of client.getQueriesData<Pages>({ queryKey: LIST_QUERY_KEY })) {
    const found = data?.pages.flatMap((page) => page.items).find((e) => e.id === id);
    if (found) return found;
  }
  return undefined;
}

/**
 * 1 件の変化（prev → next。追加は prev が null、削除は next が null）を先回りして書き込む。
 * - 合計: prev の分を引き、next の分を足す。残高は合計から導くので、端数を含めてサーバーと一致する
 * - 削除: 読んだどの絞り込みの履歴からも除く（消えた物はどの絞り込みにも合わない）
 * - 追加・編集: 絞り込みの無い履歴にだけ入れる。絞り込みに合うかはサーバーが決めるので、
 *   絞り込んだ履歴は書き込み後の取り直し（invalidate）に任せる
 */
function applyChange(client: QueryClient, prev: Expense | null, next: Expense | null): void {
  client.setQueryData(totalsQueryOptions.queryKey, (totals) => {
    if (!totals) return totals;
    const withoutPrev = prev ? addTotal(totals, prev, -1) : totals;
    return next ? addTotal(withoutPrev, next, 1) : withoutPrev;
  });
  const id = (prev ?? next)?.id;
  if (id === undefined) return;
  client.setQueriesData<Pages>({ queryKey: LIST_QUERY_KEY }, (data) =>
    data ? withoutExpense(data, id) : data,
  );
  if (next) {
    client.setQueryData(expensesQueryOptions(UNFILTERED).queryKey, (data) =>
      data ? withExpense(data, next) : data,
    );
  }
}

function addTotal(totals: ExpenseTotal[], e: Expense, sign: 1 | -1): ExpenseTotal[] {
  const same = (t: ExpenseTotal) => t.fromUserId === e.fromUserId && t.toUserId === e.toUserId;
  const delta = sign * e.amount;
  return totals.some(same)
    ? totals.map((t) => (same(t) ? { ...t, amount: t.amount + delta } : t))
    : [...totals, { fromUserId: e.fromUserId, toUserId: e.toUserId, amount: delta }];
}

function withoutExpense(data: Pages, id: string): Pages {
  return {
    ...data,
    pages: data.pages.map((page) => ({ ...page, items: page.items.filter((e) => e.id !== id) })),
  };
}

/**
 * 使った日が収まるページに入れる。各ページは nextCursor の日以降（null なら最も古い日まで）を持つので、
 * 新しいほうから見て最初に収まるページ。まだ読んでいない古い日なら入れない（読んだときに出る）。
 */
function withExpense(data: Pages, expense: Expense): Pages {
  const index = data.pages.findIndex(
    (page) => page.nextCursor === null || expense.spentOn >= page.nextCursor,
  );
  if (index < 0) return data;
  return {
    ...data,
    pages: data.pages.map((page, i) =>
      i === index ? { ...page, items: sortExpenses([...page.items, expense]) } : page,
    ),
  };
}
