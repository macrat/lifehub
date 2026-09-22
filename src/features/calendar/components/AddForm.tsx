import { TaskForm } from '../../events/components/TaskForm.tsx';
import { defaultParticipants, defaultTaskValues } from '../../events/form-values.ts';
import { useCreateEvent } from '../../events/queries.ts';
import { ExpenseForm } from '../../expenses/components/ExpenseForm.tsx';
import { useAddExpense } from '../../expenses/queries.ts';
import { CareLogForm } from '../../lemon/components/CareLogForm.tsx';
import { useLogCare } from '../../lemon/queries.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';

/** その場でフォームが開く種類。予定だけは時間帯を見ながら入れるので、カレンダーの日表示へ送る */
export type AddFormKind = 'task' | 'expense' | 'lemon';

type Props = {
  kind: AddFormKind;
  onClose: () => void;
};

/**
 * 何もない所から 1 件追加するフォーム。種類ごとの既定値と保存先をここにまとめ、
 * 追加ボタン（`AddMenu`）からも PWA のショートカット（各画面の `add`）からも同じ物を開く。
 */
export function AddForm({ kind, onClose }: Props) {
  const createEvent = useCreateEvent();
  const addExpense = useAddExpense();
  const logCare = useLogCare();
  const { meId } = useUserLabels();

  switch (kind) {
    case 'task':
      return (
        <TaskForm
          initial={defaultTaskValues(defaultParticipants(meId))}
          onSubmit={createEvent.mutateAsync}
          onClose={onClose}
        />
      );
    case 'expense':
      return <ExpenseForm onSubmit={addExpense.mutateAsync} onClose={onClose} />;
    case 'lemon':
      return <CareLogForm onSubmit={logCare.mutateAsync} onClose={onClose} />;
  }
}
