import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { formatDateTime } from '../../../lib/date.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import { useRecordDetail } from '../../../lib/ui/use-record-detail.tsx';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { type Memo, useDeleteMemo, usePinMemo, useUpdateMemo } from '../queries.ts';
import { useMemoForm } from '../use-memo-form.ts';
import { MemoField } from './MemoField.tsx';

type Props = {
  memo: Memo;
  /** 開いた時点から入力欄にするか（行を長押しで開いたとき） */
  initialEditing?: boolean;
  onClose: () => void;
};

/**
 * メモの詳細。鉛筆で同じシートの中が入力欄に変わり、三点リーダーからピン止め（外す）と削除をする。
 * 直せるのは本文だけで、書いた人と時刻は変わらない。
 * 直す・消すは書いた本人だけで（サーバーも同じ規則で拒む）、ほかの人のメモは鉛筆も削除も出さない。
 * ピン止めはホームの並べ方を変えるだけなので、ほかの人のメモでもできる（三点リーダーにピン止めだけを出す）。
 * ピン止めしてもシートは閉じない（編集の途中でもピン止めでき、打ちかけの本文を失わない）。開いたときの
 * memo は変わらないので、ピン止めしたかはシートの中で持ち、メニューの文言をそれに合わせる。
 * 呼び出し側が項目を選んでいる間だけマウントする（閉じれば編集中の状態も消える）。
 */
export function MemoDetailSheet({ memo, initialEditing = false, onClose }: Props) {
  const { authorName, meId } = useUserLabels();
  const updateMemo = useUpdateMemo();
  const deleteMemo = useDeleteMemo();
  const pinMemo = usePinMemo();
  const [pinned, setPinned] = useState(memo.pinned);
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
    actions: [
      {
        label: pinned ? 'ピン止め解除' : 'ピン止め',
        icon: pinned ? <PushPinOutlinedIcon /> : <PushPinIcon />,
        onClick: () => {
          pinMemo.mutate({ id: memo.id, pinned: !pinned });
          setPinned(!pinned);
        },
      },
    ],
    onClose,
  });

  return (
    <RecordSheet title="メモ" {...detail.sheet}>
      {detail.editing ? (
        <MemoField value={body} onChange={setBody} error={errors.body} />
      ) : (
        <>
          <Typography color="textSecondary">
            {[authorName(memo.createdBy), formatDateTime(memo.createdAt)]
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
