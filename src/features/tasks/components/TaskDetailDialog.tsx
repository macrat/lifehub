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
import { formatDateTime } from '../../../lib/date.ts';
import type { CalendarTaskItem } from '../../calendar/queries.ts';
import { useRecurrenceEditing } from '../../calendar/use-recurrence-editing.ts';
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
  const editing = useRecurrenceEditing({
    isRecurring: item?.isRecurring ?? false,
    onDelete: async (scope) => {
      if (!item) return;
      await deleteTask.mutateAsync({ id: item.id, scope, occurrenceKey: item.occurrenceKey });
      onClose();
    },
  });
  const { editScope } = editing;
  const master = useQuery({
    ...taskQueryOptions(item?.id ?? ''),
    enabled: item !== null && editScope === 'all' && item.isRecurring,
  });

  if (!item) return null;

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
          <Button color="error" startIcon={<DeleteIcon />} onClick={() => editing.start('delete')}>
            削除
          </Button>
          <Button startIcon={<EditIcon />} onClick={() => editing.start('edit')}>
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
        open={editing.pending !== null}
        action={editing.pending ?? 'edit'}
        onSelect={editing.selectScope}
        onClose={editing.cancel}
      />

      {editScope !== null && initialValues && (
        <TaskForm
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
            editing.endEdit();
            onClose();
          }}
        />
      )}
    </>
  );
}
