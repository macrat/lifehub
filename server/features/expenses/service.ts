import {
  type Balance,
  balanceOf,
  type Expense,
  type ExpensePage,
  type ExpenseTotal,
} from '../../../shared/expenses.ts';
import { newId } from '../../../shared/id.ts';
import type { ExpenseInput, ExpenseListQuery } from '../../../shared/validation/expenses.ts';
import { NotFoundError, ValidationError } from '../../lib/errors.ts';
import * as users from '../users/service.ts';
import * as repository from './repository.ts';
import type { ExpenseRow } from './schema.ts';

export type { Balance, Expense } from '../../../shared/expenses.ts';

/**
 * 1 ページの件数の目安（日の途中では切らないので、これより多くなることがある）。
 * 1 日は数件なので、スマホの画面数枚分になる
 */
const PAGE_SIZE = 50;

/**
 * 履歴の 1 ページ（古い順）。全件を返さないのは、履歴は増え続けるのに画面が見るのは新しいほうだけだから。
 * 古いほうは nextCursor を before に渡して続きを読む（`findPage`）。
 */
export async function listExpenses({ before, ...filter }: ExpenseListQuery): Promise<ExpensePage> {
  const { rows, olderThan } = await repository.findPage(filter, before, PAGE_SIZE);
  return { items: rows.map(toExpense), nextCursor: olderThan };
}

/** 立替残高（借方・貸方）。式は shared/expenses.ts。利用者が 2 人のときだけ計算できる */
export async function getBalance(): Promise<Balance> {
  return balanceOf(await repository.sumByDirection(), await twoUsers());
}

/**
 * 残高の元になる「誰が誰のために払ったか」ごとの合計（最大 6 行）。クライアントはこれと
 * ユーザーから残高を導く。書き込みの結果を先に出すとき（楽観的更新）、残高そのものからは
 * 折半の端数が分からず正しく足し引きできないが、合計なら 1 件分を足し引きするだけで済む
 */
export async function getTotals(): Promise<ExpenseTotal[]> {
  return repository.sumByDirection();
}

/** id はクライアントが決めて送ってくる（`createExpenseRequestSchema`）。省略された呼び出し（MCP）はここで採番する */
export async function addExpense(
  input: ExpenseInput,
  userId: string,
  id: string = newId(),
): Promise<Expense> {
  return toExpense(await repository.insert({ ...input, id, createdBy: userId }));
}

/** 全項目を置き換える。記録した人（createdBy）は変えない */
export async function updateExpense(id: string, input: ExpenseInput): Promise<Expense> {
  const row = await repository.update(id, input);
  if (!row) throw new NotFoundError('立替が見つかりません');
  return toExpense(row);
}

export async function deleteExpense(id: string): Promise<void> {
  if (!(await repository.remove(id))) throw new NotFoundError('立替が見つかりません');
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

async function twoUsers(): Promise<[string, string]> {
  const list = await users.listUsers();
  const [a, b] = list;
  // 3 人以上のときに先頭 2 人だけで黙って計算しない
  if (!a || !b || list.length !== 2) {
    throw new ValidationError('立替の計算はユーザーが 2 人のときだけ行えます');
  }
  return [a.id, b.id];
}
