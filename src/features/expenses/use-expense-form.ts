import { useState } from 'react';
import { today } from '../../../shared/date.ts';
import { expenseSchema } from '../../../shared/validation/expenses.ts';
import { formText, useFormSubmit } from '../../lib/form.ts';
import { useUserLabels } from '../users/use-user-labels.ts';
import { evaluate } from './calculator.ts';
import { canChooseSharedTo, chooseFrom, type Parties, toCandidates } from './parties.ts';
import type { ExpenseBody } from './queries.ts';

/**
 * 立替フォームの共通処理。追加（`ExpenseForm`）と詳細からの編集（`ExpenseDetailSheet`）で
 * 同じ組み立てと検証を使う。金額欄の中身は電卓の式そのもの（"1200+800" など）なので、
 * 入力欄ではなくここで状態として持つ（計算結果の置き場は別に持たない）。
 * To・From も、From を選ぶと To が入れ替わることがあるので、2 つまとめてここで持つ。
 * 入力欄に渡すものは `fields` にまとめ、`ExpenseFields` へそのまま渡せるようにする。
 */
export function useExpenseForm({
  initial,
  onSubmit,
  onSaved,
}: {
  /** 最初に入れておく値。編集なら今の立替、精算のカードから始めた追加ならその精算。省いた項目は追加の既定値 */
  initial?: Partial<ExpenseBody>;
  onSubmit: (input: ExpenseBody) => Promise<unknown>;
  onSaved: () => void;
}) {
  const { users, meId } = useUserLabels();
  const [amount, setAmount] = useState(initial?.amount === undefined ? '' : String(initial.amount));
  // From の undefined は「まだ選んでいない」（null は共有）。既定のログイン中のユーザーは読み込みを待つので、使う時に決める
  const [chosen, setChosen] = useState<{ toUserId: string | null; fromUserId?: string | null }>({
    toUserId: initial?.toUserId ?? null,
    fromUserId: initial?.fromUserId,
  });
  const parties: Parties = {
    toUserId: chosen.toUserId,
    fromUserId: chosen.fromUserId === undefined ? (meId ?? users[0]?.id ?? '') : chosen.fromUserId,
  };

  const form = useFormSubmit({
    schema: expenseSchema,
    values: (fd) => ({
      ...parties,
      amount: evaluate(amount) ?? undefined,
      description: formText(fd, 'description') ?? '',
      spentOn: formText(fd, 'spentOn') ?? today(),
    }),
    onSubmit,
    onSaved,
  });
  return {
    ...form,
    fields: {
      parties,
      toUsers: toCandidates(users, parties),
      toShared: canChooseSharedTo(parties),
      fromUsers: users,
      onChangeTo: (toUserId: string | null) => setChosen((c) => ({ ...c, toUserId })),
      onChangeFrom: (fromUserId: string | null) => setChosen(chooseFrom(parties, fromUserId)),
      amount,
      onChangeAmount: setAmount,
      errors: form.errors,
    },
  };
}

/** `ExpenseFields` に渡す入力欄の状態 */
export type ExpenseFieldsState = ReturnType<typeof useExpenseForm>['fields'];
