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
import { useState } from 'react';
import type { RecurrenceScope } from '../../../../shared/validation/events.ts';
import { formatEventRange } from '../../../lib/date.ts';
import type { CalendarEventItem } from '../../calendar/queries.ts';
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
  const [pending, setPending] = useState<'編集' | '削除' | null>(null);
  const [editScope, setEditScope] = useState<RecurrenceScope | null>(null);
  // 「すべて」の編集はマスター（先頭の回の日時）から始めるので取り直す
  const master = useQuery({
    ...eventQueryOptions(item?.id ?? ''),
    enabled: item !== null && editScope === 'all' && item.isRecurring,
  });

  if (!item) return null;

  const chooseScope = (action: '編集' | '削除') => {
    if (item.isRecurring) {
      setPending(action);
    } else {
      proceed(action, 'all');
    }
  };

  const proceed = async (action: '編集' | '削除', scope: RecurrenceScope) => {
    setPending(null);
    if (action === '編集') {
      setEditScope(scope);
      return;
    }
    if (
      !window.confirm(
        scope === 'all' && item.isRecurring ? 'すべての回を削除しますか？' : '削除しますか？',
      )
    ) {
      return;
    }
    await deleteEvent.mutateAsync({ id: item.id, scope, occurrenceStart: item.occurrenceStart });
    onClose();
  };

  // この回だけ／これ以降は開いている回の日時から、すべてはマスターの日時から始める
  const initialValues: EventFormValues | null =
    editScope === 'all' && item.isRecurring
      ? ((master.data as EventFormValues | undefined) ?? null)
      : item;

  return (
    <>
      <Dialog open={editScope === null} onClose={onClose} fullWidth maxWidth="xs">
        <DialogTitle>{item.title}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <Typography>{formatEventRange(item.startsAt, item.endsAt, item.allDay)}</Typography>
            <Stack direction="row" spacing={1}>
              <Chip size="small" label={label(item.ownerUserId)} />
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
          <Button color="error" startIcon={<DeleteIcon />} onClick={() => chooseScope('削除')}>
            削除
          </Button>
          <Button startIcon={<EditIcon />} onClick={() => chooseScope('編集')}>
            編集
          </Button>
          <Button onClick={onClose} variant="contained">
            閉じる
          </Button>
        </DialogActions>
      </Dialog>

      <RecurrenceScopeDialog
        open={pending !== null}
        action={pending ?? '編集'}
        onSelect={(scope) => pending && proceed(pending, scope)}
        onClose={() => setPending(null)}
      />

      {editScope !== null && initialValues && (
        <EventForm
          open
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
              occurrenceStart: item.occurrenceStart,
            })
          }
          onClose={() => {
            setEditScope(null);
            onClose();
          }}
        />
      )}
    </>
  );
}
