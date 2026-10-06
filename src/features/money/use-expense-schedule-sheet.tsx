import { useState } from 'react';
import type { ScheduleFrequency } from '../../../shared/money.ts';
import { deleteAction } from '../../lib/ui/use-record-detail.tsx';
import {
  type ExpenseSchedule,
  useAddExpenseSchedule,
  useDeleteExpenseSchedule,
  useUpdateExpenseSchedule,
} from './queries.ts';
import { useExpenseForm } from './use-expense-form.ts';

/**
 * 立替スケジュールのシート（`ExpenseScheduleSheet`）の状態と操作。開いたときから入力欄で、schedule が無ければ追加、
 * あれば変更（まだ記録していない回にだけ効く）。変更のときは三点リーダーに削除を出す（記録した立替は残る）。
 * 項目は立替のフォーム（`useExpenseForm`）をそのまま使い、日付を最初の日として送る。繰り返しは選ぶだけで
 * 誤りになり得ないので、ここで状態として持つ
 */
export function useExpenseScheduleSheet(schedule: ExpenseSchedule | null, onClose: () => void) {
  const add = useAddExpenseSchedule();
  const update = useUpdateExpenseSchedule();
  const remove = useDeleteExpenseSchedule();
  const [frequency, setFrequency] = useState<ScheduleFrequency>(schedule?.frequency ?? 'monthly');
  const { fields, sheet } = useExpenseForm({
    initial: schedule ? { ...schedule, occurredOn: schedule.startsOn } : undefined,
    onSubmit: ({ occurredOn, ...input }) => {
      const values = { ...input, startsOn: occurredOn, frequency };
      return schedule
        ? update.mutateAsync({ id: schedule.id, ...values })
        : add.mutateAsync(values);
    },
    onSaved: onClose,
  });
  const actions = schedule
    ? [
        deleteAction(
          {
            confirm: 'この立替スケジュールを削除しますか？（記録した立替は残ります）',
            run: () => remove.mutate(schedule.id),
          },
          onClose,
        ),
      ]
    : [];
  return { fields, frequency, setFrequency, sheet: { ...sheet, onClose, actions } };
}
