import { expenseSchema } from '../../../shared/validation/expenses.ts';
import { useRecordDetail } from '../../lib/ui/use-record-detail.tsx';
import { type Expense, useDeleteExpense, useUpdateExpense } from './queries.ts';
import { useExpenseForm } from './use-expense-form.ts';

/**
 * 立替の詳細（`ExpenseDetailSheet`）の状態と操作。編集のフォーム・保存・削除をまとめ、シートには
 * 表示するもの（`sheet`・閲覧か編集か・入力欄）だけを返す。保存・削除が済んだら詳細を閉じる（`onClose`）。
 */
export function useExpenseDetail(expense: Expense, initialEditing: boolean, onClose: () => void) {
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const { fields, sheet } = useExpenseForm({
    schema: expenseSchema,
    initial: expense,
    onSubmit: (input) => updateExpense.mutateAsync({ id: expense.id, ...input }),
    onSaved: onClose,
  });
  const detail = useRecordDetail({
    initialEditing,
    form: sheet,
    remove: { confirm: 'この立替を削除しますか？', run: () => deleteExpense.mutate(expense.id) },
    onClose,
  });
  return { ...detail, fields };
}
