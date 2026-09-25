import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import { useAddExpense } from '../queries.ts';
import { useExpenseForm } from '../use-expense-form.ts';
import { ExpenseFields } from './ExpenseFields.tsx';

/**
 * 立替を追加する。保存先（`useAddExpense`）はこの中で持つので、どこから開いても同じ所へ保存する
 * （詳細の `ExpenseDetailSheet` が自分で更新の mutation を持つのと同じ）。編集は詳細から行う。
 */
export function ExpenseForm({ onClose }: { onClose: () => void }) {
  const addExpense = useAddExpense();
  const {
    amount,
    setAmount,
    parties,
    setTo,
    setFrom,
    errors,
    submitError,
    submitted,
    handleSubmit,
  } = useExpenseForm({
    onSubmit: addExpense.mutateAsync,
    onSaved: onClose,
  });

  return (
    <RecordSheet
      open={!submitted}
      error={submitError}
      onClose={onClose}
      title="立替を追加"
      onSubmit={handleSubmit}
    >
      <ExpenseFields
        parties={parties}
        onChangeTo={setTo}
        onChangeFrom={setFrom}
        amount={amount}
        onChangeAmount={setAmount}
        errors={errors}
      />
    </RecordSheet>
  );
}
