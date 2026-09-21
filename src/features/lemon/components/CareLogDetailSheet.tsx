import DeleteIcon from '@mui/icons-material/Delete';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { CARE_TYPE_LABELS } from '../../../../shared/validation/lemon.ts';
import { formatDateTime } from '../../../lib/date.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import { type CareLog, useDeleteCareLog, useUpdateCareLog } from '../queries.ts';
import { useCareLogForm } from '../use-care-log-form.ts';
import { CareLogFields } from './CareLogFields.tsx';

type Props = {
  log: CareLog;
  onClose: () => void;
};

/**
 * 世話の記録の詳細。鉛筆で同じシートの中が入力欄に変わり、三点リーダーから削除する。
 * 呼び出し側が項目を選んでいる間だけマウントする（閉じれば編集中の状態も消える）。
 */
export function CareLogDetailSheet({ log, onClose }: Props) {
  const updateLog = useUpdateCareLog();
  const deleteLog = useDeleteCareLog();
  const [editing, setEditing] = useState(false);
  const { careType, setCareType, errors, submitError, submitted, handleSubmit } = useCareLogForm({
    initialCareType: log.careType,
    onSubmit: (input) => updateLog.mutateAsync({ id: log.id, ...input }),
    onSaved: onClose,
  });

  return (
    <RecordSheet
      title={CARE_TYPE_LABELS[careType]}
      open={!submitted}
      onClose={onClose}
      editing={editing}
      onEdit={() => setEditing(true)}
      actions={[
        {
          label: '削除',
          icon: <DeleteIcon />,
          danger: true,
          onClick: () => {
            if (!window.confirm('この記録を削除しますか？')) return;
            deleteLog.mutate(log.id);
            onClose();
          },
        },
      ]}
      onSubmit={handleSubmit}
      error={submitError}
    >
      {editing ? (
        <CareLogFields
          careType={careType}
          onChangeCareType={setCareType}
          doneAt={log.doneAt}
          note={log.note}
          errors={errors}
        />
      ) : (
        <>
          <Typography>{formatDateTime(log.doneAt)}</Typography>
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
