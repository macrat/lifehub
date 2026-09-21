import { useState } from 'react';
import { expenseSchema } from '../../../shared/validation/expenses.ts';
import { today } from '../../lib/date.ts';
import { formSelect, formText, useFormSubmit } from '../../lib/form.ts';
import { evaluate } from './calculator.ts';
import type { Expense, ExpenseBody } from './queries.ts';

/**
 * 立替フォームの共通処理。追加（`ExpenseForm`）と詳細からの編集（`ExpenseDetailSheet`）で
 * 同じ組み立てと検証を使う。金額欄の中身は電卓の式そのもの（"1200+800" など）なので、
 * 入力欄ではなくここで状態として持つ（計算結果の置き場は別に持たない）。
 */
export function useExpenseForm({
  initial,
  onSubmit,
  onSaved,
}: {
  /** 編集する立替。省略すると追加 */
  initial?: Expense;
  onSubmit: (input: ExpenseBody) => Promise<unknown>;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const form = useFormSubmit({
    schema: expenseSchema,
    values: (fd) => ({
      fromUserId: formText(fd, 'fromUserId'),
      toUserId: formSelect(fd, 'toUserId'),
      amount: evaluate(amount) ?? undefined,
      description: formText(fd, 'description') ?? '',
      spentOn: formText(fd, 'spentOn') ?? today(),
    }),
    onSubmit,
    onSaved,
  });
  return { ...form, amount, setAmount };
}
