import { useQuery } from '@tanstack/react-query';
import type { CareType } from '../../../../shared/validation/lemon.ts';
import { meQueryOptions } from '../../../lib/auth.ts';
import { TaskForm } from '../../events/components/TaskForm.tsx';
import { defaultParticipants, defaultTaskValues } from '../../events/form-values.ts';
import { useCreateEvent } from '../../events/queries.ts';
import { ExpenseForm } from '../../expenses/components/ExpenseForm.tsx';
import { useAddExpense } from '../../expenses/queries.ts';
import { CareLogForm } from '../../lemon/components/CareLogForm.tsx';
import { useLogCare } from '../../lemon/queries.ts';
import type { AddFormKind } from '../kinds.ts';

type Props = {
  kind: AddFormKind;
  onClose: () => void;
};

/**
 * 何もない所から 1 件追加するフォーム。追加ボタン（`AddMenu`）からも
 * PWA のショートカット（各画面の `add`）からも、種類を渡すだけで同じ既定値の入力が開く。
 * 種類ごとの中身は下の 3 つで、それぞれの画面の追加ボタンからも同じものを開く。
 */
export function AddForm({ kind, onClose }: Props) {
  switch (kind) {
    case 'task':
      return <AddTaskForm onClose={onClose} />;
    case 'expense':
      return <AddExpenseForm onClose={onClose} />;
    case 'lemon':
      return <AddCareLogForm onClose={onClose} />;
  }
}

/** 日時なしのタスク。参加者の既定は自分だけ */
function AddTaskForm({ onClose }: { onClose: () => void }) {
  const createEvent = useCreateEvent();
  // 要るのは自分の ID だけなので、ユーザー一覧まで読む `useUserLabels` は使わない
  const { data: me } = useQuery(meQueryOptions);
  return (
    <TaskForm
      initial={defaultTaskValues(defaultParticipants(me?.id ?? null))}
      onSubmit={createEvent.mutateAsync}
      onClose={onClose}
    />
  );
}

export function AddExpenseForm({ onClose }: { onClose: () => void }) {
  const addExpense = useAddExpense();
  return <ExpenseForm onSubmit={addExpense.mutateAsync} onClose={onClose} />;
}

/** レモンの記録。最初からチェックを入れておく項目は、状況のタイルから始めたときだけ渡る */
export function AddCareLogForm({
  initialCareTypes,
  onClose,
}: {
  initialCareTypes?: CareType[];
  onClose: () => void;
}) {
  const logCare = useLogCare();
  return (
    <CareLogForm
      initialCareTypes={initialCareTypes}
      onSubmit={logCare.mutateAsync}
      onClose={onClose}
    />
  );
}
