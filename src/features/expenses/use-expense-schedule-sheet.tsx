import { expenseScheduleSchema } from '../../../shared/validation/expenses.ts';
import { deleteMenuAction } from '../../lib/ui/use-record-detail.tsx';
import {
  type ExpenseSchedule,
  useAddExpenseSchedule,
  useDeleteExpenseSchedule,
  useUpdateExpenseSchedule,
} from './queries.ts';
import { useExpenseForm } from './use-expense-form.ts';

/**
 * 立替スケジュールのシート（`ExpenseScheduleSheet`）の状態と操作。開いたときから入力欄で、schedule が無ければ追加、
 * あれば変更（まだ記録していない回にだけ効く）。変更のときは三点リーダーに削除を出す（記録した立替は残る）
 */
export function useExpenseScheduleSheet(schedule: ExpenseSchedule | null, onClose: () => void) {
  const add = useAddExpenseSchedule();
  const update = useUpdateExpenseSchedule();
  const remove = useDeleteExpenseSchedule();
  const { fields, sheet } = useExpenseForm({
    schema: expenseScheduleSchema,
    initial: schedule ? { ...schedule, spentOn: schedule.startsOn } : undefined,
    onSubmit: (input) =>
      schedule ? update.mutateAsync({ id: schedule.id, ...input }) : add.mutateAsync(input),
    onSaved: onClose,
  });
  const actions = schedule
    ? [
        deleteMenuAction(() => {
          if (!window.confirm('この立替スケジュールを削除しますか？（記録した立替は残ります）'))
            return;
          remove.mutate(schedule.id);
          onClose();
        }),
      ]
    : [];
  return { fields, sheet: { ...sheet, onClose, actions } };
}
