import { today } from '../../../shared/date.ts';
import type { CreateExpenseInput } from '../../../shared/validation/expenses.ts';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors.ts';
import * as users from '../users/service.ts';
import * as repository from './repository.ts';

export type Expense = {
  id: string;
  paidBy: string;
  amount: number;
  description: string;
  spentOn: string;
  createdAt: string;
};

export type Settlement = {
  id: string;
  fromUser: string;
  toUser: string;
  amount: number;
  settledOn: string;
  createdAt: string;
};

/** 残高。fromUserId が toUserId に amount 円を支払うと精算される。0 なら両方 null */
export type Balance =
  | { amount: 0; fromUserId: null; toUserId: null }
  | { amount: number; fromUserId: string; toUserId: string };

export async function listHistory(): Promise<{ expenses: Expense[]; settlements: Settlement[] }> {
  const [expenseRows, settlementRows] = await Promise.all([
    repository.findAllExpenses(),
    repository.findAllSettlements(),
  ]);
  return {
    expenses: expenseRows.map((r) => ({
      id: r.id,
      paidBy: r.paidBy,
      amount: r.amount,
      description: r.description,
      spentOn: r.spentOn,
      createdAt: r.createdAt.toISOString(),
    })),
    settlements: settlementRows.map((r) => ({
      id: r.id,
      fromUser: r.fromUser,
      toUser: r.toUser,
      amount: r.amount,
      settledOn: r.settledOn,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/**
 * 立替残高。A が B に対して持つ債権 = (ΣA 立替 − ΣB 立替) / 2 + ΣA→B 精算 − ΣB→A 精算。端数は切り捨て。
 * （X→Y 精算 = X が Y に支払った額。B が A に支払えば A の債権は減る）
 * 利用者は 2 人固定。登録順の先頭 2 人を A, B として計算する。
 */
export async function getBalance(): Promise<Balance> {
  const [a, b] = await twoUsers();
  const { expenses, settlements } = await listHistory();
  const paidA = sum(expenses.filter((e) => e.paidBy === a).map((e) => e.amount));
  const paidB = sum(expenses.filter((e) => e.paidBy === b).map((e) => e.amount));
  const settledAtoB = sum(
    settlements.filter((s) => s.fromUser === a && s.toUser === b).map((s) => s.amount),
  );
  const settledBtoA = sum(
    settlements.filter((s) => s.fromUser === b && s.toUser === a).map((s) => s.amount),
  );
  const claimOfA = Math.trunc((paidA - paidB) / 2) + settledAtoB - settledBtoA;
  if (claimOfA === 0) return { amount: 0, fromUserId: null, toUserId: null };
  return claimOfA > 0
    ? { amount: claimOfA, fromUserId: b, toUserId: a }
    : { amount: -claimOfA, fromUserId: a, toUserId: b };
}

export async function addExpense(input: CreateExpenseInput, userId: string): Promise<Expense> {
  const row = await repository.insertExpense({ ...input, createdBy: userId });
  return {
    id: row.id,
    paidBy: row.paidBy,
    amount: row.amount,
    description: row.description,
    spentOn: row.spentOn,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function deleteExpense(id: string): Promise<void> {
  if (!(await repository.deleteExpense(id))) throw new NotFoundError('立替が見つかりません');
}

/** 現在の残高をそのまま精算する。金額の手入力はしない。 */
export async function settle(userId: string, now: Date = new Date()): Promise<Settlement> {
  const balance = await getBalance();
  if (balance.fromUserId === null) throw new ConflictError('精算済みです');
  const row = await repository.insertSettlement({
    fromUser: balance.fromUserId,
    toUser: balance.toUserId,
    amount: balance.amount,
    settledOn: today(now),
    createdBy: userId,
  });
  return {
    id: row.id,
    fromUser: row.fromUser,
    toUser: row.toUser,
    amount: row.amount,
    settledOn: row.settledOn,
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
