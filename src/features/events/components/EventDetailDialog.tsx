import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { formatEventRange } from '../../../lib/date.ts';
import type { CalendarEventItem } from '../../calendar/queries.ts';
import { useRecurrenceEditing } from '../../calendar/use-recurrence-editing.ts';
import { useOwnerLabel } from '../../users/use-owner-label.ts';
import { eventQueryOptions, useDeleteEvent, useUpdateEvent } from '../queries.ts';
import { describeRRule } from '../recurrence-options.ts';
import { EventForm, type EventFormValues } from './EventForm.tsx';
import { RecurrenceScopeDialog } from './RecurrenceScopeDialog.tsx';

type Props = {
  item: CalendarEventItem | null;
  onClose: () => void;
};

/**
 * 予定の詳細。編集・削除の入口で、繰り返しなら範囲（この回だけ／これ以降／すべて）を先に選ばせる。
 * 状態の変更は mutation（queries.ts）に集約し、ここは表示と操作の受け渡しに徹する。
 */
export function EventDetailDialog({ item, onClose }: Props) {
  const { label } = useOwnerLabel();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const editing = useRecurrenceEditing({
    isRecurring: item?.isRecurring ?? false,
    onDelete: async (scope) => {
      if (!item) return;
      await deleteEvent.mutateAsync({
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
    ...eventQueryOptions(item?.id ?? ''),
    enabled: item !== null && editScope === 'all' && item.isRecurring,
  });

  if (!item) return null;

  // この回だけ／これ以降は開いている回の値から、すべては繰り返し元の値から始める
  const initialValues: EventFormValues | null =
    editScope === 'all' && item.isRecurring ? (master.data ?? null) : item;

  return (
    <>
      <Dialog open={editScope === null} onClose={onClose} fullWidth maxWidth="xs">
        <DialogTitle>{item.title}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <Typography>{formatEventRange(item.startsAt, item.endsAt, item.allDay)}</Typography>
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
        <DialogActions>
          <Button color="error" startIcon={<DeleteIcon />} onClick={() => editing.start('delete')}>
            削除
          </Button>
          <Button startIcon={<EditIcon />} onClick={() => editing.start('edit')}>
            編集
          </Button>
          <Button onClick={onClose} variant="contained">
            閉じる
          </Button>
        </DialogActions>
      </Dialog>

      <RecurrenceScopeDialog
        open={editing.pending !== null}
        action={editing.pending ?? 'edit'}
        onSelect={editing.selectScope}
        onClose={editing.cancel}
      />

      {editScope !== null && initialValues && (
        <EventForm
          title={
            editScope === 'this'
              ? 'この回だけ編集'
              : editScope === 'following'
                ? 'これ以降を編集'
                : '予定を編集'
          }
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
