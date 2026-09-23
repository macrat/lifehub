import {
  hashKey,
  type InfiniteData,
  infiniteQueryOptions,
  keepPreviousData,
  type QueryClient,
  queryOptions,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { InferRequestType } from 'hono/client';
import { useEffect } from 'react';
import {
  BALANCE_NEEDS_TWO_USERS,
  type Balance,
  balanceOf,
  balancePair,
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

type Pages = InfiniteData<ExpensePage>;

/**
 * 履歴（絞り込みごと）。サーバーが新しいほうから 1 ページずつ返し、上へスクロールすると
 * 古いほうのページを足す（`fetchNextPage`）。pages[0] が最新のページで、各ページの中は古い順。
 * 絞り込みはサーバーが掛ける（手元にあるのは読んだページだけなので、手元では絞り込めない）。
 */
function expensesQueryOptions(filter: ExpenseFilter) {
  const filtered = Object.values(filter).some((value) => value !== undefined);
  return infiniteQueryOptions({
    queryKey: [...LIST_QUERY_KEY, filter],
    initialPageParam: undefined as string | undefined,
    // 絞り込んだ結果は打つたびに別のキーになるので、既定（7 日）のまま端末に溜めない
    ...(filtered ? { gcTime: 1000 * 60 } : {}),
    queryFn: async ({ pageParam }): Promise<ExpensePage> => {
      const query = {
        ...filter,
        min: filter.min?.toString(),
        max: filter.max?.toString(),
        before: pageParam,
      };
      return (await ensureOk(await api.expenses.$get({ query }))).json();
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/**
 * 立替画面の履歴。読んだページを古い順に繋いで返し、上の端へ近づいたら古いほうのページを読む。
 * 絞り込みを変えたら、取り直せるまで前の結果を出したままにする（打つたびに骨組みへ戻さない）。
 * resetKey は絞り込みで、変わったら一覧を一番下（最新）へ戻す合図。ready は出している結果が
 * その絞り込みの物か（前の結果を出している間は位置を決めない）。
 *
 * 画面を離れるときは最新のページだけを残す。取り直し（画面に入ったとき・書き込みの後）は
 * 読んだページをすべて順に読み直すので、遡った分を残すと以後ずっとその回数だけ問い合わせる。
 */
export function useExpenseHistory(filter: ExpenseFilter) {
  const queryClient = useQueryClient();
  const options = expensesQueryOptions(filter);
  const { data, error, hasNextPage, isFetchingNextPage, isPlaceholderData, fetchNextPage } =
    useInfiniteQuery({ ...options, placeholderData: keepPreviousData });
  const resetKey = hashKey(options.queryKey);
  // biome-ignore lint/correctness/useExhaustiveDependencies: キーが同じなら同じキャッシュを指す
  useEffect(
    () => () => {
      queryClient.setQueryData(
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
  const pair = users.data && balancePair(users.data);
  return {
    data: totals.data && pair ? balanceOf(totals.data, pair) : undefined,
    error:
      totals.error ??
      users.error ??
      (users.data && !pair ? new Error(BALANCE_NEEDS_TWO_USERS) : null),
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
      applyChange(client, input.id, null, { ...input, createdAt: new Date().toISOString() });
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
      if (prev) applyChange(client, id, prev, { ...prev, ...input });
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
      if (prev) applyChange(client, id, prev, null);
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
