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
import { formatDateTime } from '../../../lib/date.ts';
import type { CalendarTaskItem } from '../../calendar/queries.ts';
import { RecurrenceScopeDialog } from '../../events/components/RecurrenceScopeDialog.tsx';
import { describeRRule } from '../../events/recurrence-options.ts';
import { useOwnerLabel } from '../../users/use-owner-label.ts';
import {
  taskQueryOptions,
  useDeleteTask,
  useToggleTaskCompletion,
  useUpdateTask,
} from '../queries.ts';
import { TaskForm, type TaskFormValues } from './TaskForm.tsx';

type Props = {
  item: CalendarTaskItem | null;
  onClose: () => void;
};

/** タスクの詳細。完了／取り消し、編集・削除（繰り返しなら範囲を先に選ぶ）。 */
export function TaskDetailDialog({ item, onClose }: Props) {
  const { label } = useOwnerLabel();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const toggle = useToggleTaskCompletion();
  const [pending, setPending] = useState<'編集' | '削除' | null>(null);
  const [editScope, setEditScope] = useState<RecurrenceScope | null>(null);
  const master = useQuery({
    ...taskQueryOptions(item?.id ?? ''),
    enabled: item !== null && editScope === 'all' && item.isRecurring,
  });

  if (!item) return null;

  const chooseScope = (action: '編集' | '削除') => {
    if (item.isRecurring) setPending(action);
    else proceed(action, 'all');
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
    )
      return;
    await deleteTask.mutateAsync({ id: item.id, scope, occurrenceKey: item.occurrenceKey });
    onClose();
  };

  const completed = item.completedAt !== null;
  const initialValues: TaskFormValues | null =
    editScope === 'all' && item.isRecurring
      ? ((master.data as TaskFormValues | undefined) ?? null)
      : item;

  return (
    <>
      <Dialog open={editScope === null} onClose={onClose} fullWidth maxWidth="xs">
        <DialogTitle sx={{ textDecoration: completed ? 'line-through' : 'none' }}>
          {item.title}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            {item.startsAt && <Typography>開始: {formatDateTime(item.startsAt)}</Typography>}
            {item.dueAt && (
              <Typography color={item.isOverdue ? 'error' : 'text.primary'}>
                期限: {formatDateTime(item.dueAt)}
                {item.isOverdue && '（超過）'}
              </Typography>
            )}
            {completed && item.completedAt && (
              <Typography color="text.secondary">
                完了: {formatDateTime(item.completedAt)}
              </Typography>
            )}
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              <Chip size="small" label={label(item.assigneeUserId)} />
              {item.isRecurring && (
                <Chip size="small" variant="outlined" label={describeRRule(item.rrule)} />
              )}
              {item.isModified && (
                <Chip size="small" variant="outlined" label="この回だけ変更あり" />
              )}
            </Stack>
            {item.note && (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {item.note}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <Button color="error" startIcon={<DeleteIcon />} onClick={() => chooseScope('削除')}>
            削除
          </Button>
          <Button startIcon={<EditIcon />} onClick={() => chooseScope('編集')}>
            編集
          </Button>
          <Button
            variant="contained"
            disabled={toggle.isPending}
            onClick={async () => {
              await toggle.mutateAsync({
                id: item.id,
                occurrenceKey: item.occurrenceKey,
                completed: !completed,
              });
              onClose();
            }}
          >
            {completed ? '完了を取り消す' : '完了にする'}
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
        <TaskForm
          open
          title={
            editScope === 'this'
              ? 'この回だけ編集'
              : editScope === 'following'
                ? 'これ以降を編集'
                : 'タスクを編集'
          }
          initial={initialValues}
          scope={editScope}
          onSubmit={(input) =>
            updateTask.mutateAsync({
              id: item.id,
              ...input,
              scope: editScope,
              occurrenceKey: item.occurrenceKey,
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
