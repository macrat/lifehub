import { useQuery } from '@tanstack/react-query';
import { meQueryOptions } from '../../../lib/auth.ts';
import { ItemCreateForm } from '../../events/components/ItemCreateForm.tsx';
import { defaultParticipants, defaultTaskValues } from '../../events/form-values.ts';
import { ExpenseForm } from '../../expenses/components/ExpenseForm.tsx';
import { CareLogForm } from '../../lemon/components/CareLogForm.tsx';
import { MemoForm } from '../../memos/components/MemoForm.tsx';
import type { AddFormKind } from '../kinds.ts';

type Props = {
  kind: AddFormKind;
  onClose: () => void;
};

/**
 * 何もない所から 1 件追加するフォーム。追加ボタン（`AddMenu`）からも
 * PWA のショートカット（各画面の `add`）からも、種類を渡すだけで同じ既定値の入力が開く。
 * 立替・レモン・メモはそれぞれの機能のフォームそのもので、各画面の追加ボタンからも同じものを開く。
 */
export function AddForm({ kind, onClose }: Props) {
  switch (kind) {
    case 'task':
      return <AddTaskForm onClose={onClose} />;
    case 'expense':
      return <ExpenseForm onClose={onClose} />;
    case 'lemon':
      return <CareLogForm onClose={onClose} />;
    case 'memo':
      return <MemoForm onClose={onClose} />;
  }
}

/** 日時なしのタスク。参加者の既定は自分だけ */
function AddTaskForm({ onClose }: { onClose: () => void }) {
  // 要るのは自分の ID だけなので、ユーザー一覧まで読む `useUserLabels` は使わない
  const { data: me } = useQuery(meQueryOptions);
  return (
    <ItemCreateForm
      kind="task"
      initial={defaultTaskValues(defaultParticipants(me?.id ?? null))}
      onClose={onClose}
    />
  );
}
