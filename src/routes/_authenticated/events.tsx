import AddIcon from '@mui/icons-material/Add';
import Fab from '@mui/material/Fab';
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
import { DayList } from '../../features/calendar/components/DayList.tsx';
import {
  type CalendarItem,
  calendarItemsQueryOptions,
  groupByDate,
} from '../../features/calendar/queries.ts';
import { EventDetailDialog } from '../../features/events/components/EventDetailDialog.tsx';
import { defaultEventValues, EventForm } from '../../features/events/components/EventForm.tsx';
import { useCreateEvent } from '../../features/events/queries.ts';
import { useOwnerLabel } from '../../features/users/use-owner-label.ts';
import { addDays, today } from '../../lib/date.ts';
import { PageTitle } from '../../lib/ui/PageTitle.tsx';

const searchSchema = z.object({
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  kind: z.enum(['all', 'event', 'task']).default('all'),
  /** 'shared' = 共有、それ以外はユーザー ID */
  owner: z.string().optional(),
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
    if (search.owner === 'shared' && item.ownerUserId !== null) return false;
    if (search.owner && search.owner !== 'shared' && item.ownerUserId !== search.owner)
      return false;
    if (search.q) {
      const q = search.q.toLowerCase();
      const haystack = `${item.title} ${item.location ?? ''} ${item.note ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
  const grouped = groupByDate(filtered);

  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [creating, setCreating] = useState(false);
  const createEvent = useCreateEvent();

  const setSearch = (next: Partial<z.infer<typeof searchSchema>>) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  return (
    <>
      <PageTitle title="イベント" />
      <Stack
        direction="row"
        spacing={1}
        sx={{ flexWrap: 'wrap', rowGap: 1, mb: 2, '& > *': { minWidth: 140 } }}
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
          value={search.owner ?? ''}
          onChange={(e) => setSearch({ owner: e.target.value || undefined })}
        >
          <MenuItem value="">すべて</MenuItem>
          {ownerOptions.map((o) => (
            <MenuItem key={o.value ?? 'shared'} value={o.value ?? 'shared'}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="検索"
          type="search"
          size="small"
          defaultValue={search.q ?? ''}
          onChange={(e) => setSearch({ q: e.target.value || undefined })}
          sx={{ flexGrow: 1 }}
        />
      </Stack>

      {grouped.size === 0 ? (
        <Typography color="text.secondary">この期間の項目はありません</Typography>
      ) : (
        <Stack spacing={3}>
          {[...grouped.entries()].map(([date, dayItems]) => (
            <DayList key={date} date={date} items={dayItems} onSelectItem={setSelected} />
          ))}
        </Stack>
      )}

      <Fab
        color="primary"
        aria-label="予定を追加"
        onClick={() => setCreating(true)}
        sx={{
          position: 'fixed',
          right: 16,
          bottom: { xs: 'calc(56px + env(safe-area-inset-bottom) + 16px)', md: 24 },
        }}
      >
        <AddIcon />
      </Fab>
      {creating && (
        <EventForm
          open
          title="予定を追加"
          initial={defaultEventValues()}
          onSubmit={(input) => createEvent.mutateAsync(input)}
          onClose={() => setCreating(false)}
        />
      )}
      <EventDetailDialog
        item={selected?.kind === 'event' ? selected : null}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
