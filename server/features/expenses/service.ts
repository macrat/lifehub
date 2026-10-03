import {
  type Balance,
  balanceOf,
  balancePair,
  type Expense,
  type ExpenseTotal,
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

/**
 * 立替残高（借方・貸方）。式は shared/expenses.ts。users は利用者の一覧（登録順。`balancePair` が先頭 2 人を選ぶ）で、
 * 呼び出し側が手元に持っているものを渡す（MCP は要求ごとに 1 度だけ読む）。
 * ちょうど 2 人でなければ計算できないので null（呼び出し側が残高を出さずに済ませられるよう、例外ではなく値で返す）
 */
export async function getBalance(users: { id: string }[]): Promise<Balance | null> {
  const pair = balancePair(users);
  return pair && balanceOf(await repository.sumByDirection(), pair);
}

/**
 * 残高の元になる「誰が誰のために払ったか」ごとの合計（最大 6 行）。クライアントはこれと
 * ユーザーから残高を導く。書き込みの結果を先に出すとき（楽観的更新）、残高そのものからは
 * 折半の端数が分からず正しく足し引きできないが、合計なら 1 件分を足し引きするだけで済む
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
  const updated = await repository.update(id, input);
  if (!updated) throw new NotFoundError('立替が見つかりません');
  publishChanged({ type: 'expense', record: toExpense(updated) }, 'updated', { userId: actorId });
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
