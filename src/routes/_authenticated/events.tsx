import FilterListIcon from '@mui/icons-material/FilterList';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import type { DateString } from '../../../shared/types.ts';
import { dateStringSchema } from '../../../shared/validation/common.ts';
import { AddMenu } from '../../features/calendar/components/AddMenu.tsx';
import { DayList } from '../../features/calendar/components/DayList.tsx';
import { ItemDialogs } from '../../features/calendar/components/ItemDialogs.tsx';
import {
  type CalendarItem,
  calendarItemsQueryOptions,
  groupByDate,
} from '../../features/calendar/queries.ts';
import { defaultEventValues, EventForm } from '../../features/events/components/EventForm.tsx';
import { useCreateEvent } from '../../features/events/queries.ts';
import { defaultTaskValues, TaskForm } from '../../features/tasks/components/TaskForm.tsx';
import { useCreateTask } from '../../features/tasks/queries.ts';
import { useOwnerLabel } from '../../features/users/use-owner-label.ts';
import { addDays, today } from '../../lib/date.ts';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';

const searchSchema = z.object({
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  kind: z.enum(['all', 'event', 'task']).default('all'),
  /** 'all' = すべて、'shared' = 共有、それ以外はユーザー ID */
  owner: z.string().default('all'),
  /** タスクの完了状態。all = 両方、open = 未完了のみ、done = 完了のみ（予定は除く） */
  completed: z.enum(['all', 'open', 'done']).default('all'),
  q: z.string().optional(),
});

export const Route = createFileRoute('/_authenticated/events')({
  validateSearch: searchSchema,
  component: EventsPage,
});

/** カレンダーと同じデータを時系列リストで扱う画面。初期範囲は今日から前後 7 日。 */
function EventsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const from: DateString = search.from ?? addDays(today(), -7);
  const to: DateString = search.to ?? addDays(today(), 7);
  const { options: ownerOptions } = useOwnerLabel();

  const { data: items = [] } = useQuery(calendarItemsQueryOptions({ from, to }));
  const filtered = items.filter((item) => {
    if (search.kind !== 'all' && item.kind !== search.kind) return false;
    const owner = item.kind === 'event' ? item.ownerUserId : item.assigneeUserId;
    if (search.owner === 'shared' && owner !== null) return false;
    if (search.owner !== 'all' && search.owner !== 'shared' && owner !== search.owner) return false;
    if (search.completed === 'open' && item.kind === 'task' && item.completedAt !== null)
      return false;
    if (search.completed === 'done' && (item.kind !== 'task' || item.completedAt === null))
      return false;
    if (search.q) {
      const q = search.q.toLowerCase();
      const location = item.kind === 'event' ? (item.location ?? '') : '';
      const haystack = `${item.title} ${location} ${item.note ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
  const grouped = groupByDate(filtered);

  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [creating, setCreating] = useState<'event' | 'task' | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = [
    search.kind !== 'all',
    search.owner !== 'all',
    search.completed !== 'all',
    search.from !== undefined || search.to !== undefined,
  ].filter(Boolean).length;
  const createEvent = useCreateEvent();
  const createTask = useCreateTask();

  const setSearch = (next: Partial<z.infer<typeof searchSchema>>) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  return (
    <>
      <AppBarContent>
        {/* 検索は常に手が届く位置（AppBar）に。細かい絞り込みは必要なときだけ開く */}
        <InputBase
          type="search"
          placeholder="検索"
          defaultValue={search.q ?? ''}
          onChange={(e) => setSearch({ q: e.target.value || undefined })}
          inputProps={{ 'aria-label': '検索' }}
          sx={{ flexGrow: 1, bgcolor: 'action.hover', borderRadius: 5, px: 1.5, py: 0.25 }}
        />
        <IconButton
          aria-label="絞り込み"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <Badge badgeContent={activeFilters} color="primary">
            <FilterListIcon />
          </Badge>
        </IconButton>
      </AppBarContent>
      <Collapse in={filtersOpen}>
        <Box
          sx={{
            display: 'grid',
            gap: 1,
            // スマホは main の余白が 0 なので左右を空け、上はアウトラインのラベル分（切れないように）
            px: { xs: 2, md: 0 },
            pt: 1,
            mb: 2,
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(5, minmax(0, 1fr))',
            },
          }}
        >
          <TextField
            label="開始"
            type="date"
            size="small"
            value={from}
            onChange={(e) => setSearch({ from: e.target.value as DateString })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="終了"
            type="date"
            size="small"
            value={to}
            onChange={(e) => setSearch({ to: e.target.value as DateString })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="種別"
            select
            size="small"
            value={search.kind}
            onChange={(e) => setSearch({ kind: e.target.value as 'all' | 'event' | 'task' })}
          >
            <MenuItem value="all">すべて</MenuItem>
            <MenuItem value="event">予定</MenuItem>
            <MenuItem value="task">タスク</MenuItem>
          </TextField>
          <TextField
            label="誰の"
            select
            size="small"
            value={search.owner}
            onChange={(e) => setSearch({ owner: e.target.value })}
          >
            <MenuItem value="all">すべて</MenuItem>
            {ownerOptions.map((o) => (
              <MenuItem key={o.value ?? 'shared'} value={o.value ?? 'shared'}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="完了"
            select
            size="small"
            value={search.completed}
            onChange={(e) => setSearch({ completed: e.target.value as 'all' | 'open' | 'done' })}
          >
            <MenuItem value="all">すべて</MenuItem>
            <MenuItem value="open">未完了</MenuItem>
            <MenuItem value="done">完了済み</MenuItem>
          </TextField>
        </Box>
      </Collapse>

      {grouped.size === 0 ? (
        <Typography color="text.secondary">この期間の項目はありません</Typography>
      ) : (
        <Stack spacing={3}>
          {[...grouped.entries()].map(([date, dayItems]) => (
            <DayList key={date} date={date} items={dayItems} onSelectItem={setSelected} />
          ))}
        </Stack>
      )}

      <AddMenu onAddEvent={() => setCreating('event')} onAddTask={() => setCreating('task')} />
      {creating === 'event' && (
        <EventForm
          open
          title="予定を追加"
          initial={defaultEventValues()}
          onSubmit={(input) => createEvent.mutateAsync(input)}
          onClose={() => setCreating(null)}
        />
      )}
      {creating === 'task' && (
        <TaskForm
          open
          title="タスクを追加"
          initial={defaultTaskValues()}
          onSubmit={(input) => createTask.mutateAsync(input)}
          onClose={() => setCreating(null)}
        />
      )}
      <ItemDialogs item={selected} onClose={() => setSelected(null)} />
    </>
  );
}
