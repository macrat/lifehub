import { type ExpenseInput, expenseSchema } from '../../../../shared/validation/expenses.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import { useAddExpense } from '../queries.ts';
import { useExpenseForm } from '../use-expense-form.ts';
import { ExpenseFields } from './ExpenseFields.tsx';

type Props = {
  /** 最初に入れておく値（精算のカードから始めたときはその精算）。省いた項目は追加の既定値 */
  initial?: Partial<ExpenseInput>;
  onClose: () => void;
};

/**
 * 立替を追加する。保存先（`useAddExpense`）はこの中で持つので、どこから開いても同じ所へ保存する
 * （詳細の `useExpenseDetail` が更新の mutation を持つのと同じ）。編集は詳細から行う。
 */
export function ExpenseForm({ initial, onClose }: Props) {
  const addExpense = useAddExpense();
  const { fields, sheet } = useExpenseForm({
    schema: expenseSchema,
    initial,
    onSubmit: addExpense.mutateAsync,
    onSaved: onClose,
  });

  return (
    <RecordSheet {...sheet} onClose={onClose} title="立替を追加">
      <ExpenseFields {...fields} />
    </RecordSheet>
  );
}
