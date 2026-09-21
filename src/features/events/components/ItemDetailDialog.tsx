import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { formatDateTime, formatEventRange } from '../../../lib/date.ts';
import { Dialog } from '../../../lib/ui/Dialog.tsx';
import type { CalendarItem } from '../../calendar/queries.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import type { ItemFormValues } from '../form-values.ts';
import {
  eventQueryOptions,
  useDeleteEvent,
  useToggleCompletion,
  useUpdateEvent,
} from '../queries.ts';
import { describeRRule } from '../recurrence-options.ts';
import { useRecurrenceEditing } from '../use-recurrence-editing.ts';
import { EventForm } from './EventForm.tsx';
import { RecurrenceScopeDialog } from './RecurrenceScopeDialog.tsx';
import { TaskForm } from './TaskForm.tsx';

type Props = {
  item: CalendarItem;
  onClose: () => void;
};

const EDIT_TITLES = { this: 'この回だけ編集', following: 'これ以降を編集', all: '編集' } as const;

/**
 * 予定・タスクの詳細。編集・削除の入口で、繰り返しなら範囲（この回だけ／これ以降／すべて）を先に選ばせる。
 * タスクは完了／取り消しもここから。状態の変更は mutation（queries.ts）に集約し、ここは表示と操作の受け渡しに徹する。
 * 呼び出し側が項目を選んでいる間だけマウントする（閉じれば編集中の状態も消える）。
 */
export function ItemDetailDialog({ item, onClose }: Props) {
  const { label } = useUserLabels();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const toggle = useToggleCompletion();
  const editing = useRecurrenceEditing({
    isRecurring: item.isRecurring,
    onDelete: (scope) => {
      deleteEvent.mutate({
        id: item.id,
        scope,
        occurrenceStart: item.occurrenceStart ?? undefined,
      });
      onClose();
    },
  });
  const { editScope } = editing;
  // 「すべて」の編集は繰り返し元（先頭の回の日時）から始めるので取り直す
  const master = useQuery({
    ...eventQueryOptions(item.id),
    enabled: editScope === 'all' && item.isRecurring,
  });

  const isTask = item.kind === 'task';
  const completed = item.completedAt !== null;
  // この回だけ／これ以降は開いている回の値から、すべては繰り返し元の値から始める
  const initialValues: ItemFormValues | null =
    editScope === 'all' && item.isRecurring ? (master.data ?? null) : item;
  const Form = isTask ? TaskForm : EventForm;

  return (
    <>
      <Dialog open={editScope === null} onClose={onClose} fullWidth maxWidth="xs">
        <DialogTitle sx={{ textDecoration: completed ? 'line-through' : 'none' }}>
          {item.title}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            {item.kind === 'event' ? (
              <Typography>{formatEventRange(item.startsAt, item.endsAt, item.allDay)}</Typography>
            ) : (
              <>
                {item.startsAt && <Typography>開始: {formatDateTime(item.startsAt)}</Typography>}
                {item.endsAt && (
                  <Typography color={item.isOverdue ? 'error' : 'text.primary'}>
                    期限: {formatDateTime(item.endsAt)}
                    {item.isOverdue && '（超過）'}
                  </Typography>
                )}
                {item.completedAt && (
                  <Typography color="text.secondary">
                    完了: {formatDateTime(item.completedAt)}
                  </Typography>
                )}
              </>
            )}
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              {item.participantIds.map((id) => (
                <Chip key={id} size="small" label={label(id)} />
              ))}
              {item.isRecurring && (
                <Chip size="small" variant="outlined" label={describeRRule(item.rrule)} />
              )}
              {item.isModified && (
                <Chip size="small" variant="outlined" label="この回だけ変更あり" />
              )}
            </Stack>
            {item.location && (
              <Typography variant="body2" color="text.secondary">
                場所: {item.location}
              </Typography>
            )}
            {item.note && (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {item.note}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <Button color="error" startIcon={<DeleteIcon />} onClick={() => editing.start('delete')}>
            削除
          </Button>
          <Button startIcon={<EditIcon />} onClick={() => editing.start('edit')}>
            編集
          </Button>
          {isTask ? (
            <Button
              variant="contained"
              onClick={() => {
                toggle.mutate({
                  id: item.id,
                  occurrenceStart: item.occurrenceStart,
                  completed: !completed,
                });
                onClose();
              }}
            >
              {completed ? '完了を取り消す' : '完了にする'}
            </Button>
          ) : (
            <Button onClick={onClose} variant="contained">
              閉じる
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {editing.pending && (
        <RecurrenceScopeDialog
          action={editing.pending}
          onSelect={editing.selectScope}
          onClose={editing.cancel}
        />
      )}

      {editScope !== null && initialValues && (
        <Form
          title={EDIT_TITLES[editScope]}
          initial={initialValues}
          scope={editScope}
          onSubmit={(input) =>
            updateEvent.mutateAsync({
              id: item.id,
              ...input,
              scope: editScope,
              occurrenceStart: item.occurrenceStart ?? undefined,
            })
          }
          onClose={() => {
            editing.endEdit();
            onClose();
          }}
        />
      )}
    </>
  );
}
