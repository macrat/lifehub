import { useState } from 'react';
import { today } from '../../../shared/date.ts';
import { expenseSchema } from '../../../shared/validation/expenses.ts';
import { formText, useFormSubmit } from '../../lib/form.ts';
import { useUserLabels } from '../users/use-user-labels.ts';
import { evaluate } from './calculator.ts';
import { chooseFrom, type Parties } from './parties.ts';
import type { Expense, ExpenseBody } from './queries.ts';

/**
 * 立替フォームの共通処理。追加（`ExpenseForm`）と詳細からの編集（`ExpenseDetailSheet`）で
 * 同じ組み立てと検証を使う。金額欄の中身は電卓の式そのもの（"1200+800" など）なので、
 * 入力欄ではなくここで状態として持つ（計算結果の置き場は別に持たない）。
 * To・From も、From を選ぶと To が入れ替わることがあるので、2 つまとめてここで持つ。
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
  const { users, meId } = useUserLabels();
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  // From の null は「まだ選んでいない」。既定のログイン中のユーザーは読み込みを待つので、使う時に決める
  const [chosen, setChosen] = useState<{ to: string | null; from: string | null }>({
    to: initial?.toUserId ?? null,
    from: initial?.fromUserId ?? null,
  });
  const parties: Parties = { to: chosen.to, from: chosen.from ?? meId ?? users[0]?.id ?? '' };

  const form = useFormSubmit({
    schema: expenseSchema,
    values: (fd) => ({
      fromUserId: parties.from || undefined,
      toUserId: parties.to,
      amount: evaluate(amount) ?? undefined,
      description: formText(fd, 'description') ?? '',
      spentOn: formText(fd, 'spentOn') ?? today(),
    }),
    onSubmit,
    onSaved,
  });
  return {
    ...form,
    amount,
    setAmount,
    parties,
    setTo: (to: string | null) => setChosen({ ...chosen, to }),
    setFrom: (from: string) => setChosen(chooseFrom(parties, from)),
  };
}
