import { useQuery } from '@tanstack/react-query';
import { meQueryOptions } from '../../../lib/auth.ts';
import { TaskForm } from '../../events/components/TaskForm.tsx';
import { defaultParticipants, defaultTaskValues } from '../../events/form-values.ts';
import { useCreateEvent } from '../../events/queries.ts';
import { ExpenseForm } from '../../expenses/components/ExpenseForm.tsx';
import { useAddExpense } from '../../expenses/queries.ts';
import { CareLogForm } from '../../lemon/components/CareLogForm.tsx';
import { useLogCare } from '../../lemon/queries.ts';
import type { AddFormKind } from '../add-kinds.ts';

type Props = {
  kind: AddFormKind;
  onClose: () => void;
};

/**
 * 何もない所から 1 件追加するフォーム。追加ボタン（`AddMenu`）からも
 * PWA のショートカット（各画面の `add`）からも、種類を渡すだけで同じ既定値の入力が開く。
 * 立替・レモンの画面にある追加ボタンは、その画面が持つ一覧と同じクエリからフォームを開くので
 * ここは通らない（開く物は同じ）。
 */
export function AddForm({ kind, onClose }: Props) {
  const createEvent = useCreateEvent();
  const addExpense = useAddExpense();
  const logCare = useLogCare();
  // 要るのは自分の ID だけなので、ユーザー一覧まで読む `useUserLabels` は使わない
  const { data: me } = useQuery(meQueryOptions);

  switch (kind) {
    case 'task':
      return (
        <TaskForm
          initial={defaultTaskValues(defaultParticipants(me?.id ?? null))}
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
