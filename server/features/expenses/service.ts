import {
  type Expense,
  type ExpenseTotal,
  type Settlement,
  settlementsOf,
} from '../../../shared/expenses.ts';
import { newId } from '../../../shared/id.ts';
import { expenseEntry } from '../../../shared/timeline.ts';
import type { HistoryPage } from '../../../shared/types.ts';
import {
  type ExpenseInput,
  type ExpenseListQuery,
  expenseRulesSchema,
} from '../../../shared/validation/expenses.ts';
import { NotFoundError } from '../../lib/errors.ts';
import { applyPatch, checkRules } from '../../lib/patch.ts';
import { recordTimelineSource } from '../../lib/timeline-source.ts';
import { publishChanged } from '../mcp-events/service.ts';
import * as repository from './repository.ts';
import type { ExpenseRow } from './schema.ts';

/**
 * 履歴の 1 ページ（古い順）。全件を返さないのは、履歴は増え続けるのに画面が見るのは新しいほうだけだから。
 * 古いほうは nextCursor を before に渡して続きを読む（`findHistoryPage`）。
 */
export async function listExpenses(query: ExpenseListQuery): Promise<HistoryPage<Expense>> {
  const { items, nextCursor } = await repository.findPage(query);
  return { items: items.map(toExpense), nextCursor };
}

/** タイムラインに並べる立替（置く日時は shared/timeline.ts の `expenseEntry`。キーワードは内容の部分一致） */
export const timelineSource = recordTimelineSource(repository.timeline, (row) =>
  expenseEntry(toExpense(row)),
);

/** 立替を帳消しにする最小限の資金移動（式は shared/expenses.ts の `settlementsOf`）。空なら精算済み */
export async function getSettlements(): Promise<Settlement[]> {
  return settlementsOf(await repository.sumByDirection());
}

/**
 * 精算の元になる「誰が誰のために払ったか」ごとの合計（最大 6 行）。クライアントはこれから精算を導く。
 * 書き込みの結果を先に出すとき（楽観的更新）、精算の組み方からは 1 件分を足し引きできないが、
 * 合計なら 1 件分を足し引きするだけで済む
 */
export async function getTotals(): Promise<ExpenseTotal[]> {
  return repository.sumByDirection();
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
