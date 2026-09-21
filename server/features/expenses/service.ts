import { type Balance, computeBalance, type Expense } from '../../../shared/expenses.ts';
import type { CreateExpenseInput } from '../../../shared/validation/expenses.ts';
import { NotFoundError, ValidationError } from '../../lib/errors.ts';
import * as users from '../users/service.ts';
import * as repository from './repository.ts';
import type { ExpenseRow } from './schema.ts';

export type { Balance, Expense } from '../../../shared/expenses.ts';

export async function listExpenses(): Promise<Expense[]> {
  return (await repository.findAll()).map(toExpense);
}

/** 立替残高（借方・貸方）。式は shared/expenses.ts。利用者が 2 人のときだけ計算できる */
export async function getBalance(): Promise<Balance> {
  return computeBalance(await listExpenses(), await twoUsers());
}

export async function addExpense(input: CreateExpenseInput, userId: string): Promise<Expense> {
  return toExpense(await repository.insert({ ...input, createdBy: userId }));
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
