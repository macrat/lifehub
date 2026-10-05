import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import { formatDateTime } from '../../lib/date.ts';
import { useRecordDetail } from '../../lib/ui/use-record-detail.tsx';
import { useUserLabels } from '../users/use-user-labels.ts';
import { type Memo, useDeleteMemo, useIsPinned, usePinMemo, useUpdateMemo } from './queries.ts';
import { useMemoForm } from './use-memo-form.ts';

/**
 * メモの詳細（`MemoDetailSheet`）の状態と操作。編集のフォーム・保存・削除・ピン止めをまとめ、シートには
 * 表示するもの（`sheet`・閲覧か編集か・入力欄・書いた人と時刻）だけを返す。
 * - 直す・消すは書いた本人だけ（サーバーも同じ規則で拒む）。ほかの人のメモは鉛筆も削除も出さない
 * - ピン止めはホームの並べ方を変えるだけなので、ほかの人のメモでもできる
 * - ピン止めしてもシートは閉じない（編集の途中でもピン止めでき、打ちかけの本文を失わない）
 */
export function useMemoDetail(memo: Memo, initialEditing: boolean, onClose: () => void) {
  const { meId, writerName } = useUserLabels();
  const updateMemo = useUpdateMemo();
  const deleteMemo = useDeleteMemo();
  const pinMemo = usePinMemo();
  const pinned = useIsPinned(memo);
  const mine = memo.createdBy === meId;
  const { fields, sheet } = useMemoForm({
    initialBody: memo.body,
    onSubmit: (input) => updateMemo.mutateAsync({ id: memo.id, ...input }),
    onSaved: onClose,
  });
  const detail = useRecordDetail({
    initialEditing,
    form: sheet,
    editable: mine,
    remove: mine
      ? { confirm: 'このメモを削除しますか？', run: () => deleteMemo.mutate(memo.id) }
      : undefined,
    actions: [
      {
        label: pinned ? 'ピン止め解除' : 'ピン止め',
        icon: pinned ? <PushPinOutlinedIcon /> : <PushPinIcon />,
        onClick: () => {
          pinMemo.mutate({ id: memo.id, pinned: !pinned });
        },
      },
    ],
    onClose,
  });
  return {
    ...detail,
    fields,
    /** 書いた人（MCP で書いたメモは MCP クライアントの名前）と時刻 */
    byline: [writerName(memo.createdBy, memo.mcpClientName), formatDateTime(memo.createdAt)]
      .filter(Boolean)
      .join('・'),
  };
}
