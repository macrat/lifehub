import type { ItemFormValues } from '../form-values.ts';
import { useCreateEvent } from '../queries.ts';
import { EventForm } from './EventForm.tsx';
import { TaskForm } from './TaskForm.tsx';

type Props = {
  kind: 'event' | 'task';
  initial: ItemFormValues;
  onClose: () => void;
};

/**
 * 予定・タスクを新しく 1 件作るフォーム。種類に合った追加のフォーム（画面いっぱい）を開き、新規作成として保存する。
 * 何もない所からの追加（`AddForm`）も、既にある項目の複製（`ItemDetailSheet`）も、違うのは初期値だけなのでここを通す。
 */
export function ItemCreateForm({ kind, initial, onClose }: Props) {
  const createEvent = useCreateEvent();
  const Form = kind === 'task' ? TaskForm : EventForm;
  return <Form initial={initial} onSubmit={createEvent.mutateAsync} onClose={onClose} />;
}
