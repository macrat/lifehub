import Stack from '@mui/material/Stack';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useRef, useState } from 'react';
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
  formatDate,
  formatMonth,
  monthGridDays,
  today,
  toMonthString,
  weekDays,
} from '../../lib/date.ts';
import { APP_BAR_HEIGHT, BOTTOM_NAV_HEIGHT } from '../../lib/ui/AppShell.tsx';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';
import { useIsMobile } from '../../lib/ui/useIsMobile.ts';

const searchSchema = z.object({
  view: z.enum(['month', 'week']).default('month'),
  date: dateStringSchema.optional(),
});

export const Route = createFileRoute('/_authenticated/calendar')({
  validateSearch: searchSchema,
  component: CalendarPage,
});

/** スマホで月グリッドが画面の残り全部を占めるための高さ。AppBar・下部ナビ・上下の余白を引く */
const MOBILE_GRID_HEIGHT = `calc(100dvh - ${APP_BAR_HEIGHT}px - ${BOTTOM_NAV_HEIGHT}px - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 16px)`;

function CalendarPage() {
  const { view, date: dateParam } = Route.useSearch();
  const isMobile = useIsMobile();
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

  // 月表示で日付をタップしたら、グリッドの下にある一覧まで送る（スマホでは画面外にあるため）
  const dayListRef = useRef<HTMLDivElement>(null);
  const selectDate = (d: DateString) => {
    if (d === date) {
      dayListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setSearch({ date: d });
  };

  return (
    <>
      <AppBarContent>
        <CalendarToolbar
          title={
            view === 'month'
              ? formatMonth(date)
              : `${formatDate(days[0] as DateString)}〜${formatDate(days[6] as DateString)}`
          }
          view={view}
          onChangeView={(v) => setSearch({ view: v })}
          onPrev={() => move(-1)}
          onNext={() => move(1)}
          onToday={() => setSearch({ date: today() })}
        />
      </AppBarContent>

      {view === 'month' ? (
        <Stack spacing={0}>
          <MonthGrid
            month={month}
            itemsByDate={itemsByDate}
            selectedDate={date}
            onSelectDate={selectDate}
            onSelectItem={setSelected}
            height={isMobile ? MOBILE_GRID_HEIGHT : undefined}
          />
          <div ref={dayListRef} style={{ scrollMarginTop: APP_BAR_HEIGHT + 8 }}>
            <DayList date={date} items={itemsByDate.get(date) ?? []} onSelectItem={setSelected} />
          </div>
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
