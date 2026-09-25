import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import { useAddMemo } from '../queries.ts';
import { useMemoForm } from '../use-memo-form.ts';
import { MemoField } from './MemoField.tsx';

/**
 * メモを書く（右下の追加ボタンから）。保存先（`useAddMemo`）はこの中で持つ。編集は詳細から行う。
 * 本文を打つだけのフォームなので、タスクの追加と同じく開いた所からそのまま打てるようにする
 * （ソフトキーボードが中身を覆っても、覆われるのは打っている欄そのものだけ）。
 */
export function MemoForm({ onClose }: { onClose: () => void }) {
  const addMemo = useAddMemo();
  const { body, setBody, errors, submitError, submitted, handleSubmit } = useMemoForm({
    onSubmit: addMemo.mutateAsync,
    onSaved: onClose,
  });
  return (
    <RecordSheet
      open={!submitted}
      error={submitError}
      onClose={onClose}
      title="メモを追加"
      onSubmit={handleSubmit}
    >
      <MemoField value={body} onChange={setBody} error={errors.body} autoFocus />
    </RecordSheet>
  );
}
