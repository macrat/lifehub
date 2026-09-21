import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import type { ExpenseBody } from '../queries.ts';
import { useExpenseForm } from '../use-expense-form.ts';
import { ExpenseFields } from './ExpenseFields.tsx';

type Props = {
  onSubmit: (input: ExpenseBody) => Promise<unknown>;
  onClose: () => void;
};

/** 立替を追加する。編集は詳細（`ExpenseDetailSheet`）から行う。 */
export function ExpenseForm({ onSubmit, onClose }: Props) {
  const { amount, setAmount, errors, submitError, submitted, handleSubmit } = useExpenseForm({
    onSubmit,
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
      <ExpenseFields amount={amount} onChangeAmount={setAmount} errors={errors} />
    </RecordSheet>
  );
}
