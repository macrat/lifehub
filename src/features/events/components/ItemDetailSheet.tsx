import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import DeleteIcon from '@mui/icons-material/Delete';
import LocationOnIcon from '@mui/icons-material/LocationOnOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { isCompletedTask } from '../../../../shared/calendar.ts';
import { formatDateTime, formatEdge, formatEventRange } from '../../../lib/date.ts';
import { type RecordAction, RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import type { CalendarItem } from '../../calendar/queries.ts';
import { useUserColor } from '../../users/use-user-color.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import type { ItemFormValues } from '../form-values.ts';
import {
  eventQueryOptions,
  useDeleteEvent,
  useToggleCompletion,
  useUpdateEvent,
} from '../queries.ts';
import { describeRRule, writeTarget } from '../recurrence-options.ts';
import { useAllDay, useItemForm } from '../use-item-form.ts';
import { useRecurrenceEditing } from '../use-recurrence-editing.ts';
import { EventFormFields, ScopeChip, TaskFormFields } from './EventFields.tsx';
import { RecurrenceScopeDialog } from './RecurrenceScopeDialog.tsx';

type Props = {
  item: CalendarItem;
  /** 開いた時点から入力欄にするか（一覧の行を長押しで開いたとき。繰り返しならまず範囲を選ばせる） */
  initialEditing?: boolean;
  onClose: () => void;
};

/**
 * 予定・タスクの詳細。鉛筆で同じシートの中が入力欄に変わり、三点リーダーから削除（タスクは完了も）する。
 * 繰り返しなら編集・削除の前に範囲（この回だけ／これ以降／すべて）を選ばせる。
 * 状態の変更は mutation（queries.ts）に集約し、ここは表示と操作の受け渡しに徹する。
 * 呼び出し側が項目を選んでいる間だけマウントする（閉じれば編集中の状態も消える）。
 */
export function ItemDetailSheet({ item, initialEditing = false, onClose }: Props) {
  const { label } = useUserLabels();
  const colorFor = useUserColor();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const toggle = useToggleCompletion();
  const recurrence = useRecurrenceEditing({
    isRecurring: item.isRecurring,
    editing: initialEditing,
    onDelete: (scope) => {
      deleteEvent.mutate(writeTarget(item, scope));
      onClose();
    },
  });
  const { editScope } = recurrence;
  // 「すべて」の編集は繰り返し元（先頭の回の日時）から始めるので取り直す
  const master = useQuery({
    ...eventQueryOptions(item.id),
    enabled: editScope === 'all' && item.isRecurring,
  });

  const isTask = item.kind === 'task';
  const completed = isCompletedTask(item);
  // この回だけ／これ以降は開いている回の値から、すべては繰り返し元の値から始める
  const values: ItemFormValues | null =
    editScope === 'all' && item.isRecurring ? (master.data ?? null) : item;
  // 繰り返し元を読んでいる間はまだ入力欄に変えない（違う日時のまま出さない）
  const editing = editScope !== null && values !== null;

  const initial = values ?? item;
  const [allDay, setAllDay] = useAllDay(initial);
  const form = useItemForm({
    kind: item.kind,
    initial,
    allDay,
    scope: editScope ?? 'all',
    onSubmit: (input) =>
      updateEvent.mutateAsync({ ...input, ...writeTarget(item, editScope ?? 'all') }),
    onSaved: onClose,
  });

  const actions: RecordAction[] = [
    ...(isTask
      ? [
          {
            label: completed ? '完了を取り消す' : '完了にする',
            icon: completed ? <UndoIcon /> : <CheckCircleOutlineIcon />,
            onClick: () => {
              toggle.mutate({
                id: item.id,
                occurrenceStart: item.occurrenceStart,
                completed: !completed,
              });
              onClose();
            },
          },
        ]
      : []),
    {
      label: '削除',
      icon: <DeleteIcon />,
      danger: true,
      onClick: () => recurrence.start('delete'),
    },
  ];

  return (
    <>
      <RecordSheet
        title={item.title}
        struck={completed}
        open={!form.submitted}
        onClose={onClose}
        editing={editing}
        onEdit={() => recurrence.start('edit')}
        actions={actions}
        onSubmit={form.handleSubmit}
        error={form.submitError}
      >
        {editing && values ? (
          <>
            {item.isRecurring && editScope && <ScopeChip scope={editScope} />}
            {isTask ? (
              <TaskFormFields
                initial={values}
                errors={form.errors}
                allDay={allDay}
                onChangeAllDay={setAllDay}
                thisOnly={form.thisOnly}
                autoFocus={false}
              />
            ) : (
              <EventFormFields
                initial={values}
                errors={form.errors}
                allDay={allDay}
                onChangeAllDay={setAllDay}
                thisOnly={form.thisOnly}
              />
            )}
          </>
        ) : (
          <>
            {item.kind === 'event' ? (
              <Typography>{formatEventRange(item.startsAt, item.endsAt, item.allDay)}</Typography>
            ) : (
              <>
                {item.startsAt && (
                  <Typography>開始: {formatEdge(item.startsAt, 'start', item.allDay)}</Typography>
                )}
                {item.endsAt && (
                  <Typography color={item.isOverdue ? 'error' : 'text.primary'}>
                    期限: {formatEdge(item.endsAt, 'end', item.allDay)}
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
              {item.participantIds.map((id) => {
                const { fill, text } = colorFor(id);
                return (
                  <Chip
                    key={id}
                    size="small"
                    label={label(id)}
                    sx={{ bgcolor: fill, color: text }}
                  />
                );
              })}
              {item.isRecurring && (
                <Chip size="small" variant="outlined" label={describeRRule(item.rrule)} />
              )}
              {item.isModified && (
                <Chip size="small" variant="outlined" label="この回だけ変更あり" />
              )}
            </Stack>
            {item.location && (
              <Link
                href={mapSearchUrl(item.location)}
                target="_blank"
                rel="noreferrer"
                variant="body2"
                color="text.secondary"
                underline="hover"
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
              >
                <LocationOnIcon fontSize="small" />
                {item.location}
              </Link>
            )}
            {item.note && (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {item.note}
              </Typography>
            )}
          </>
        )}
      </RecordSheet>

      {recurrence.pending && (
        <RecurrenceScopeDialog
          action={recurrence.pending}
          onSelect={recurrence.selectScope}
          onClose={recurrence.cancel}
        />
      )}
    </>
  );
}

/**
 * 場所の文字列を Google マップの検索で開く URL。
 * 住所か店名かは入力した人しか知らないので、座標や地物の ID ではなく文字列のまま検索に渡す。
 */
function mapSearchUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}
