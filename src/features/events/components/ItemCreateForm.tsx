import type { ItemFormValues } from '../form-values.ts';
import { useCreateEvent } from '../queries.ts';
import { ItemForm } from './ItemForm.tsx';

type Props = {
  kind: 'event' | 'task';
  initial: ItemFormValues;
  onClose: () => void;
};

/**
 * 予定・タスクを新しく 1 件作るフォーム。種類に合った追加のフォーム（画面いっぱい）を開き、新規作成として保存する。
 * 今は既にある項目の複製（`ItemDetailSheet`）から開く。
 */
export function ItemCreateForm({ kind, initial, onClose }: Props) {
  const createEvent = useCreateEvent();
  return (
    <ItemForm kind={kind} initial={initial} onSubmit={createEvent.mutateAsync} onClose={onClose} />
  );
}
