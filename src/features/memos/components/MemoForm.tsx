import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import { useAddMemo } from '../queries.ts';
import { useMemoForm } from '../use-memo-form.ts';
import { MemoField } from './MemoField.tsx';

/**
 * メモを書く（右下の追加ボタンから）。保存先（`useAddMemo`）はこの中で持つ。編集は詳細から行う。
 */
export function MemoForm({ onClose }: { onClose: () => void }) {
  const addMemo = useAddMemo();
  const { fields, sheet } = useMemoForm({
    onSubmit: addMemo.mutateAsync,
    onSaved: onClose,
  });
  return (
    <RecordSheet {...sheet} onClose={onClose} title="メモを追加">
      <MemoField {...fields} />
    </RecordSheet>
  );
}
