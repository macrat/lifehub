import Typography from '@mui/material/Typography';
import { formatDateTime } from '../../../lib/date.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import { useRecordDetail } from '../../../lib/ui/use-record-detail.tsx';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { type Memo, useDeleteMemo, useUpdateMemo } from '../queries.ts';
import { useMemoForm } from '../use-memo-form.ts';
import { MemoField } from './MemoField.tsx';

type Props = {
  memo: Memo;
  /** 開いた時点から入力欄にするか（行を長押しで開いたとき） */
  initialEditing?: boolean;
  onClose: () => void;
};

/**
 * メモの詳細。鉛筆で同じシートの中が入力欄に変わり、三点リーダーから削除する。
 * 直せるのは本文だけで、書いた人と時刻は変わらない。MCP で書いたメモは書いた人の代わりに MCP クライアントの名前を出す。
 * 直す・消すは書いた本人だけで（サーバーも同じ規則で拒む）、ほかの人のメモは読むだけ。
 * 呼び出し側が項目を選んでいる間だけマウントする（閉じれば編集中の状態も消える）。
 */
export function MemoDetailSheet({ memo, initialEditing = false, onClose }: Props) {
  const { authorName, meId } = useUserLabels();
  const updateMemo = useUpdateMemo();
  const deleteMemo = useDeleteMemo();
  const { body, setBody, errors, sheet } = useMemoForm({
    initialBody: memo.body,
    onSubmit: (input) => updateMemo.mutateAsync({ id: memo.id, ...input }),
    onSaved: onClose,
  });
  const detail = useRecordDetail({
    initialEditing,
    readOnly: memo.createdBy !== meId,
    form: sheet,
    confirmDelete: 'このメモを削除しますか？',
    remove: () => deleteMemo.mutate(memo.id),
    onClose,
  });

  return (
    <RecordSheet title="メモ" {...detail.sheet}>
      {detail.editing ? (
        <MemoField value={body} onChange={setBody} error={errors.body} />
      ) : (
        <>
          <Typography color="textSecondary">
            {[memo.mcpClientName ?? authorName(memo.createdBy), formatDateTime(memo.createdAt)]
              .filter(Boolean)
              .join('・')}
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {memo.body}
          </Typography>
        </>
      )}
    </RecordSheet>
  );
}
