import type { CreateExpenseInput } from '../../../shared/validation/expenses.ts';
import { NotFoundError, ValidationError } from '../../lib/errors.ts';
import * as users from '../users/service.ts';
import * as repository from './repository.ts';
import type { ExpenseRow } from './schema.ts';

export type Expense = {
  id: string;
  fromUserId: string;
  /** null は共有（折半） */
  toUserId: string | null;
  amount: number;
  description: string;
  spentOn: string;
  createdAt: string;
};

/** 残高。fromUserId が toUserId に amount 円を支払うと精算される。0 なら両方 null */
export type Balance =
  | { amount: 0; fromUserId: null; toUserId: null }
  | { amount: number; fromUserId: string; toUserId: string };

export async function listExpenses(): Promise<Expense[]> {
  return (await repository.findAll()).map(toExpense);
}

/**
 * 立替残高（借方・貸方）。A が B に対して持つ債権 =
 *   (Σ A→共有 − Σ B→共有) / 2 + Σ A→B − Σ B→A
 * （X→Y = X が Y のために払った額。共有は折半。端数は切り捨て）
 * 精算も「B が A に払った」= B→A の行として同じ式に入るので、払えば債権が減る。
 * 利用者は 2 人固定。登録順の先頭 2 人を A, B として計算する。
 */
export async function getBalance(): Promise<Balance> {
  const [a, b] = await twoUsers();
  const expenses = await listExpenses();
  const total = (from: string, to: string | null) =>
    sum(expenses.filter((e) => e.fromUserId === from && e.toUserId === to).map((e) => e.amount));
  const claimOfA = Math.trunc((total(a, null) - total(b, null)) / 2) + total(a, b) - total(b, a);
  if (claimOfA === 0) return { amount: 0, fromUserId: null, toUserId: null };
  return claimOfA > 0
    ? { amount: claimOfA, fromUserId: b, toUserId: a }
    : { amount: -claimOfA, fromUserId: a, toUserId: b };
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
  if (!a || !b) throw new ValidationError('立替の計算にはユーザーが 2 人必要です');
  return [a.id, b.id];
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
