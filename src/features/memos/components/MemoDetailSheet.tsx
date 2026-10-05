import Typography from '@mui/material/Typography';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import type { Memo } from '../queries.ts';
import { useMemoDetail } from '../use-memo-detail.tsx';
import { MemoField } from './MemoField.tsx';

type Props = {
  memo: Memo;
  /** 開いた時点から入力欄にするか（行を長押しで開いたとき） */
  initialEditing?: boolean;
  onClose: () => void;
};

/**
 * メモの詳細。鉛筆で同じシートの中が入力欄に変わり、三点リーダーからピン止め（外す）と削除をする。
 * 直せるのは本文だけで、書いた人と時刻は変わらない。MCP で書いたメモは書いた人の代わりに MCP クライアントの名前を出す。
 * 直す・消す・ピン止めの規則と、書いた人の出し方は `useMemoDetail`。
 * 呼び出し側が項目を選んでいる間だけマウントする（閉じれば編集中の状態も消える）。
 */
export function MemoDetailSheet({ memo, initialEditing = false, onClose }: Props) {
  const detail = useMemoDetail(memo, initialEditing, onClose);

  return (
    <RecordSheet title="メモ" {...detail.sheet}>
      {detail.editing ? (
        <MemoField {...detail.fields} />
      ) : (
        <>
          <Typography color="textSecondary">{detail.byline}</Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {memo.body}
          </Typography>
        </>
      )}
    </RecordSheet>
  );
}
