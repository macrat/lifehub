import Stack from '@mui/material/Stack';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import type { DateString } from '../../../shared/types.ts';
import { dateStringSchema } from '../../../shared/validation/common.ts';
import { AddMenu } from '../../features/calendar/components/AddMenu.tsx';
import { CalendarToolbar } from '../../features/calendar/components/CalendarToolbar.tsx';
import { DayList } from '../../features/calendar/components/DayList.tsx';
import { ItemDialogs } from '../../features/calendar/components/ItemDialogs.tsx';
import { MonthGrid } from '../../features/calendar/components/MonthGrid.tsx';
import { WeekGrid } from '../../features/calendar/components/WeekGrid.tsx';
import {
  type CalendarItem,
  calendarItemsQueryOptions,
  groupByDate,
} from '../../features/calendar/queries.ts';
import { defaultEventValues, EventForm } from '../../features/events/components/EventForm.tsx';
import { useCreateEvent } from '../../features/events/queries.ts';
import { defaultTaskValues, TaskForm } from '../../features/tasks/components/TaskForm.tsx';
import { useCreateTask } from '../../features/tasks/queries.ts';
import {
  addDays,
  addMonths,
  formatMonth,
  monthGridDays,
  today,
  toMonthString,
  weekDays,
} from '../../lib/date.ts';
import { PageTitle } from '../../lib/ui/PageTitle.tsx';

const searchSchema = z.object({
  view: z.enum(['month', 'week']).default('month'),
  date: dateStringSchema.optional(),
});

export const Route = createFileRoute('/_authenticated/calendar')({
  validateSearch: searchSchema,
  component: CalendarPage,
});

function CalendarPage() {
  const { view, date: dateParam } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const date: DateString = dateParam ?? today();
  const month = toMonthString(date);

  // 表示範囲: 月はグリッドの 42 日、週は 7 日
  const days = view === 'month' ? monthGridDays(month) : weekDays(date);
  const range = { from: days[0] as DateString, to: days[days.length - 1] as DateString };
  const { data: items = [] } = useQuery(calendarItemsQueryOptions(range));
  const itemsByDate = groupByDate(items);

  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [creating, setCreating] = useState<'event' | 'task' | null>(null);
  const createEvent = useCreateEvent();
  const createTask = useCreateTask();

  const setSearch = (next: { view?: 'month' | 'week'; date?: DateString }) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  const move = (direction: 1 | -1) => {
    if (view === 'month') {
      setSearch({ date: `${addMonths(month, direction)}-01` as DateString });
    } else {
      setSearch({ date: addDays(date, 7 * direction) });
    }
  };

  return (
    <>
      <PageTitle title="カレンダー" />
      <CalendarToolbar
        title={view === 'month' ? formatMonth(date) : `${days[0]}〜${days[6]}`}
        view={view}
        onChangeView={(v) => setSearch({ view: v })}
        onPrev={() => move(-1)}
        onNext={() => move(1)}
        onToday={() => setSearch({ date: today() })}
      />
      {view === 'month' ? (
        <Stack spacing={2}>
          <MonthGrid
            month={month}
            itemsByDate={itemsByDate}
            selectedDate={date}
            onSelectDate={(d) => setSearch({ date: d })}
            onSelectItem={setSelected}
          />
          <DayList date={date} items={itemsByDate.get(date) ?? []} onSelectItem={setSelected} />
        </Stack>
      ) : (
        <WeekGrid date={date} itemsByDate={itemsByDate} onSelectItem={setSelected} />
      )}

      <AddMenu onAddEvent={() => setCreating('event')} onAddTask={() => setCreating('task')} />

      {creating === 'event' && (
        <EventForm
          open
          title="予定を追加"
          initial={defaultEventValues(date)}
          onSubmit={(input) => createEvent.mutateAsync(input)}
          onClose={() => setCreating(null)}
        />
      )}
      {creating === 'task' && (
        <TaskForm
          open
          title="タスクを追加"
          initial={defaultTaskValues(date)}
          onSubmit={(input) => createTask.mutateAsync(input)}
          onClose={() => setCreating(null)}
        />
      )}
      <ItemDialogs item={selected} onClose={() => setSelected(null)} />
    </>
  );
}
