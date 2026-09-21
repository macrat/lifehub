import DeleteIcon from '@mui/icons-material/Delete';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { CARE_TYPE_LABELS } from '../../../../shared/validation/lemon.ts';
import { formatDateTime } from '../../../lib/date.ts';
import { Dialog } from '../../../lib/ui/Dialog.tsx';
import { type CareLog, useDeleteCareLog } from '../queries.ts';

type Props = {
  log: CareLog;
  onClose: () => void;
};

/**
 * 世話の記録の詳細。削除の入口で、行には出しきれないメモも全文を出す。
 * 呼び出し側が項目を選んでいる間だけマウントする。
 */
export function CareLogDetailDialog({ log, onClose }: Props) {
  const deleteLog = useDeleteCareLog();

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{CARE_TYPE_LABELS[log.careType]}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          <Typography>{formatDateTime(log.doneAt)}</Typography>
          {log.note && (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {log.note}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        <Button
          color="error"
          startIcon={<DeleteIcon />}
          onClick={() => {
            if (!window.confirm('この記録を削除しますか？')) return;
            deleteLog.mutate(log.id);
            onClose();
          }}
        >
          削除
        </Button>
        <Button variant="contained" onClick={onClose}>
          閉じる
        </Button>
      </DialogActions>
    </Dialog>
  );
}
