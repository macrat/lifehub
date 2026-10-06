import {
  type Expense,
  type ExpenseTotal,
  type Settlement,
  settlementsOf,
} from '../../../shared/expenses.ts';
import { newId } from '../../../shared/id.ts';
import {
  expenseMoneyEntry,
  type MoneyEntry,
  sortMoneyEntries,
  transactionMoneyEntry,
} from '../../../shared/money.ts';
import { expenseEntry } from '../../../shared/timeline.ts';
import type { HistoryPage } from '../../../shared/types.ts';
import {
  type ExpenseFilter,
  type ExpenseInput,
  type ExpenseListQuery,
  expenseRulesSchema,
} from '../../../shared/validation/expenses.ts';
import { NotFoundError } from '../../lib/errors.ts';
import { type HistorySource, mergeHistoryPage } from '../../lib/history-source.ts';
import { applyPatch, checkRules } from '../../lib/patch.ts';
import { recordTimelineSource } from '../../lib/timeline-source.ts';
import { publishChanged } from '../mcp-events/service.ts';
import * as money from '../money/service.ts';
import * as repository from './repository.ts';
import type { ExpenseRow } from './schema.ts';

/**
 * お金の画面の一覧に並べる立替（`HistorySource`。日は使った日）。絞り込みは範囲の両端を含み、キーワードは内容の部分一致。
 * 一覧は入出金と 1 本に並べるので、ページに分けるのはお金の service（`listMoney`）
 */
export function historySource(filter: ExpenseFilter): HistorySource<Expense> {
  const queries = repository.history(filter);
  return {
    recentDays: queries.recentDays,
    hasBefore: queries.hasBefore,
    findInDays: async (from, before) => (await queries.findInDays(from, before)).map(toExpense),
  };
}

/** タイムラインに並べる立替（置く日時は shared/timeline.ts の `expenseEntry`。キーワードは内容の部分一致） */
export const timelineSource = recordTimelineSource(repository.timeline, (row) =>
  expenseEntry(toExpense(row)),
);

/**
 * 立替を帳消しにする最小限の資金移動（式は shared/expenses.ts の `settlementsOf`）。空なら精算済み。
 * 取り込んだ入出金のうち、ルールで「共有」との立替にしたものも入れる（`getTotals`）
 */
export async function getSettlements(): Promise<Settlement[]> {
  return settlementsOf(await getTotals());
}

/**
 * 精算の元になる「誰が誰のために払ったか」ごとの合計。立替の組ごとと、取り込んだ入出金のうちルールで「共有」との立替にした
 * ものの組ごと（money の `getTransferTotals`）を並べる（同じ組が 2 行になりうるが、精算の式は足し合わせる）。
 * クライアントはこれから精算を導く。
 * 書き込みの結果を先に出すとき（楽観的更新）、精算の組み方からは 1 件分を足し引きできないが、
 * 合計なら 1 件分を足し引きするだけで済む
 */
export async function getTotals(): Promise<ExpenseTotal[]> {
  const [expenses, transfers] = await Promise.all([
    repository.sumByDirection(),
    money.getTransferTotals(),
  ]);
  return [...expenses, ...transfers];
}

/**
 * お金の画面の一覧の 1 ページ（古い順）: 立替と取り込んだ入出金を 1 本に並べる。絞り込みは立替の一覧と同じ条件
 * （入出金への読み替えは money の `historySource`）。ページの分け方は立替だけの履歴と同じで、日の途中では切らない
 * （`mergeHistoryPage`）。立替の feature が並べるのは、精算と同じく、入出金を立替の側から読むため
 * （入出金の feature は立替を読まない。依存は立替 → 入出金の一方向）
 */
export async function listMoneyEntries({
  before,
  ...filter
}: ExpenseListQuery): Promise<HistoryPage<MoneyEntry>> {
  const page = await mergeHistoryPage<MoneyEntry>(
    [
      mapSource(historySource(filter), expenseMoneyEntry),
      mapSource(money.historySource(filter), transactionMoneyEntry),
    ],
    before,
  );
  return { ...page, items: sortMoneyEntries(page.items) };
}

/** 出どころの行を一覧の行にする */
function mapSource<T>(
  source: HistorySource<T>,
  toEntry: (record: T) => MoneyEntry,
): HistorySource<MoneyEntry> {
  return {
    ...source,
    findInDays: async (from, before) => (await source.findInDays(from, before)).map(toEntry),
  };
}

/**
 * id はクライアントが決めて送ってくる（`createExpenseRequestSchema`）。省略された呼び出し（MCP）はここで採番する。
 * 組み合わせの規則はここでも掛ける（`checkRules`）。API は入力のスキーマで確かめ済みだが、MCP は LLM の入力から
 * 組み立てた値を渡すので、どの経路の書き込みも規則を通るよう、書き込む所で確かめる（部分更新の `applyPatch` と同じ）。
 */
export async function addExpense(
  input: ExpenseInput,
  userId: string,
  id: string = newId(),
): Promise<Expense> {
  const values = checkRules(input, expenseRulesSchema);
  const expense = toExpense(await repository.insert({ ...values, id, createdBy: userId }));
  publishChanged({ type: 'expense', record: expense }, 'added', { userId });
  return expense;
}

/** 全項目を置き換える。記録した人（createdBy）は変えない。actorId は直した人 */
export async function updateExpense(
  id: string,
  input: ExpenseInput,
  actorId: string,
): Promise<void> {
  await write(id, checkRules(input, expenseRulesSchema), actorId);
}

/** 一部の項目だけを変える（MCP。`applyPatch`）。記録した人（createdBy）は変えない。actorId は直した人 */
export async function patchExpense(
  id: string,
  patch: Partial<ExpenseInput>,
  actorId: string,
): Promise<Expense> {
  const current = await repository.findById(id);
  if (!current) throw new NotFoundError('立替が見つかりません');
  const { fromUserId, toUserId, amount, description, spentOn } = current;
  const values = applyPatch(
    { fromUserId, toUserId, amount, description, spentOn },
    patch,
    expenseRulesSchema,
  );
  return write(id, values, actorId);
}

/** 書き換えて、書いた後の立替を返す（直したことを MCP Events で知らせる） */
async function write(id: string, values: ExpenseInput, actorId: string): Promise<Expense> {
  const updated = await repository.update(id, values);
  if (!updated) throw new NotFoundError('立替が見つかりません');
  const expense = toExpense(updated);
  publishChanged({ type: 'expense', record: expense }, 'updated', { userId: actorId });
  return expense;
}

/** actorId は消した人 */
export async function deleteExpense(id: string, actorId: string): Promise<void> {
  const deleted = await repository.remove(id);
  if (!deleted) throw new NotFoundError('立替が見つかりません');
  publishChanged({ type: 'expense', record: toExpense(deleted) }, 'deleted', { userId: actorId });
}

function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    amount: row.amount,
    description: row.description,
    spentOn: row.spentOn,
    createdAt: row.createdAt.toISOString(),
  };
}
