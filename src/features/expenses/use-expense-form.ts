import { useState } from 'react';
import type { z } from 'zod';
import { today } from '../../../shared/date.ts';
import type { ExpenseInput } from '../../../shared/validation/expenses.ts';
import { formText, useFormSubmit } from '../../lib/form.ts';
import { useUserLabels } from '../users/use-user-labels.ts';
import { evaluate } from './calculator.ts';
import { chooseFrom, fromCandidates, type Parties, type Party, toCandidates } from './parties.ts';

/**
 * 立替フォームの共通処理。追加（`ExpenseForm`）と詳細からの編集（`ExpenseDetailSheet`）で
 * 同じ組み立てと検証を使う。金額欄の中身は電卓の式そのもの（"1200+800" など）なので、
 * 入力欄ではなくここで状態として持つ（計算結果の置き場は別に持たない）。
 * To・From も、From を選ぶと To が入れ替わることがあるので、2 つまとめてここで持つ。
 * 入力欄に渡すものは `fields` にまとめ、`ExpenseFields` へそのまま渡せるようにする。
 * 立替スケジュールのフォームも同じ欄に繰り返し（frequency）を足して使うので、schema はフォームごとに渡す
 * （立替は `expenseSchema` で、繰り返しの欄が無いので読まずに落とす）。
 */
export function useExpenseForm<S extends z.ZodType<ExpenseInput>>({
  schema,
  initial,
  onSubmit,
  onSaved,
}: {
  schema: S;
  /** 最初に入れておく値。編集なら今の立替、精算のカードから始めた追加ならその精算。省いた項目は追加の既定値 */
  initial?: Partial<ExpenseInput>;
  onSubmit: (input: z.output<S>) => Promise<unknown>;
  onSaved: () => void;
}) {
  const { users, label, meId } = useUserLabels();
  const option = (value: Party) => ({ value, label: label(value) });
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
    schema,
    values: (fd) => ({
      ...parties,
      amount: evaluate(amount) ?? undefined,
      description: formText(fd, 'description') ?? '',
      spentOn: formText(fd, 'spentOn') ?? today(),
      frequency: formText(fd, 'frequency'),
    }),
    onSubmit,
    onSaved,
  });
  return {
    ...form,
    fields: {
      initial,
      parties,
      toOptions: toCandidates(users, parties).map(option),
      fromOptions: fromCandidates(users).map(option),
      onChangeTo: (toUserId: Party) => setChosen((c) => ({ ...c, toUserId })),
      onChangeFrom: (fromUserId: Party) => setChosen(chooseFrom(parties, fromUserId)),
      amount,
      onChangeAmount: setAmount,
      errors: form.errors,
    },
  };
}

/** `ExpenseFields` に渡す入力欄の状態 */
export type ExpenseFieldsState = ReturnType<typeof useExpenseForm>['fields'];
