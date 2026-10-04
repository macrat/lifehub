import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { formatDateTime } from '../../../lib/date.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import { UserChip } from '../../users/components/UserChip.tsx';
import type { CareLog } from '../queries.ts';
import { useCareLogDetail } from '../use-care-log-detail.ts';
import { CareLogFields } from './CareLogFields.tsx';

type Props = {
  log: CareLog;
  /** 開いた時点から入力欄にするか（行を長押しで開いたとき） */
  initialEditing?: boolean;
  onClose: () => void;
};

/**
 * 世話の記録の詳細。鉛筆で同じシートの中が入力欄に変わり、三点リーダーから削除する。
 * 呼び出し側が項目を選んでいる間だけマウントする（閉じれば編集中の状態も消える）。
 */
export function CareLogDetailSheet({ log, initialEditing = false, onClose }: Props) {
  const detail = useCareLogDetail(log, initialEditing, onClose);

  return (
    <RecordSheet title={detail.title} {...detail.sheet}>
      {detail.editing ? (
        <CareLogFields {...detail.fields} />
      ) : (
        <>
          <Typography>{formatDateTime(log.doneAt)}</Typography>
          {/* 記録した人。API キーで入れた記録は誰が記録したか分からないので出さない */}
          {log.createdBy && (
            <Stack direction="row">
              <UserChip userId={log.createdBy} />
            </Stack>
          )}
          {log.note && (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {log.note}
            </Typography>
          )}
        </>
      )}
    </RecordSheet>
  );
}
