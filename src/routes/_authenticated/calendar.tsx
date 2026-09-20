import Box from '@mui/material/Box';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { z } from 'zod';
import type { DateString } from '../../../shared/types.ts';
import { dateStringSchema } from '../../../shared/validation/common.ts';
import { AddMenu } from '../../features/calendar/components/AddMenu.tsx';
import {
  CalendarToolbar,
  type CalendarView,
} from '../../features/calendar/components/CalendarToolbar.tsx';
import { ItemDialogs } from '../../features/calendar/components/ItemDialogs.tsx';
import { type ListFilters, ListView } from '../../features/calendar/components/ListView.tsx';
import { MonthGrid } from '../../features/calendar/components/MonthGrid.tsx';
import { MonthPickerDialog } from '../../features/calendar/components/MonthPickerDialog.tsx';
import { TimelineView } from '../../features/calendar/components/TimelineView.tsx';
import {
  type CalendarItem,
  calendarItemsQueryOptions,
  groupByDate,
} from '../../features/calendar/queries.ts';
import { useSwipe } from '../../features/calendar/use-swipe.ts';
import { defaultEventValues, EventForm } from '../../features/events/components/EventForm.tsx';
import { useCreateEvent } from '../../features/events/queries.ts';
import { defaultTaskValues, TaskForm } from '../../features/tasks/components/TaskForm.tsx';
import { useCreateTask } from '../../features/tasks/queries.ts';
import {
  addDays,
  addMonths,
  formatDateRange,
  formatDateWithYear,
  formatMonth,
  monthGridDays,
  today,
  toMonthString,
  weekDays,
} from '../../lib/date.ts';
import { APP_BAR_HEIGHT, BOTTOM_NAV_HEIGHT } from '../../lib/ui/AppShell.tsx';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';

const searchSchema = z.object({
  view: z.enum(['month', 'week', 'day', 'list']).default('month'),
  date: dateStringSchema.optional(),
  // 以下はリスト表示の絞り込み
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  kind: z.enum(['all', 'event', 'task']).default('all'),
  owner: z.string().default('all'),
  completed: z.enum(['all', 'open', 'done']).default('all'),
  q: z.string().optional(),
});
type Search = z.infer<typeof searchSchema>;

export const Route = createFileRoute('/_authenticated/calendar')({
  validateSearch: searchSchema,
  component: CalendarPage,
});

/**
 * 月・週・日・リストの表示が画面の残り全部を占めるための高さ。
 * AppShell の main が下に確保している余白（追加ボタンの分）は負のマージンで打ち消す。
 */
const FILL_HEIGHT = {
  xs: `calc(100dvh - ${APP_BAR_HEIGHT}px - ${BOTTOM_NAV_HEIGHT}px - env(safe-area-inset-top) - env(safe-area-inset-bottom))`,
  md: `calc(100dvh - ${APP_BAR_HEIGHT}px - 8px)`,
};
const FILL_MARGIN_BOTTOM = { xs: '-96px', md: -12 };

/**
 * カレンダー。予定とタスクを 1 つの画面で、月（グリッド）・週／日（タイムライン）・リストの 4 通りに表示する。
 * - 日をタップするとその日の日表示へ。スマホでは左右のスワイプで前後の月・週・日へ
 * - 年月の見出しをタップすると年月の選択ダイアログ
 */
function CalendarPage() {
  const search = Route.useSearch();
  const { view } = search;
  const navigate = useNavigate({ from: Route.fullPath });
  const date: DateString = search.date ?? today();
  const month = toMonthString(date);

  const listFilters: ListFilters = {
    from: search.from ?? addDays(date, -7),
    to: search.to ?? addDays(date, 21),
    kind: search.kind,
    owner: search.owner,
    completed: search.completed,
    q: search.q ?? '',
  };

  // 取得範囲: 月はグリッドの 42 日、週は 7 日、日は 1 日、リストは絞り込みの期間
  const days =
    view === 'month'
      ? monthGridDays(month)
      : view === 'week'
        ? weekDays(date)
        : view === 'day'
          ? [date]
          : [listFilters.from, listFilters.to];
  const range = { from: days[0] as DateString, to: days[days.length - 1] as DateString };
  const { data: items = [] } = useQuery(calendarItemsQueryOptions(range));
  const itemsByDate = groupByDate(items);

  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [creating, setCreating] = useState<'event' | 'task' | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const createEvent = useCreateEvent();
  const createTask = useCreateTask();

  const setSearch = (next: Partial<Search>) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  const move = (direction: 1 | -1) => {
    if (view === 'month') setSearch({ date: `${addMonths(month, direction)}-01` as DateString });
    else if (view === 'week') setSearch({ date: addDays(date, 7 * direction) });
    else if (view === 'day') setSearch({ date: addDays(date, direction) });
  };
  const swipeRef = useRef<HTMLDivElement>(null);
  useSwipe(swipeRef, { onSwipeLeft: () => move(1), onSwipeRight: () => move(-1) });

  const title =
    view === 'month'
      ? formatMonth(date)
      : view === 'week'
        ? formatDateRange(days[0] as DateString, days[6] as DateString)
        : formatDateWithYear(date);

  const activeFilters = [
    search.kind !== 'all',
    search.owner !== 'all',
    search.completed !== 'all',
    search.from !== undefined || search.to !== undefined,
  ].filter(Boolean).length;

  return (
    <>
      <AppBarContent>
        <CalendarToolbar
          view={view}
          title={title}
          onOpenPicker={() => setPickerOpen(true)}
          onToday={() => setSearch({ date: today() })}
          onChangeView={(v: CalendarView) => setSearch({ view: v })}
          list={{
            query: listFilters.q,
            onChangeQuery: (q) => setSearch({ q: q || undefined }),
            filtersOpen,
            onToggleFilters: () => setFiltersOpen((v) => !v),
            activeFilters,
          }}
        />
      </AppBarContent>

      {view === 'list' ? (
        <ListView
          items={items}
          filters={listFilters}
          filtersOpen={filtersOpen}
          onChangeFilters={(next) =>
            setSearch({ ...next, q: next.q === undefined ? undefined : next.q || undefined })
          }
          onSelectItem={setSelected}
        />
      ) : (
        <Box
          ref={swipeRef}
          sx={{
            height: FILL_HEIGHT,
            mb: FILL_MARGIN_BOTTOM,
            // 横スワイプはこちらで扱う（ブラウザの「戻る」ジェスチャや横スクロールに取られない）
            touchAction: 'pan-y',
            overscrollBehaviorX: 'contain',
          }}
        >
          {view === 'month' ? (
            <MonthGrid
              month={month}
              itemsByDate={itemsByDate}
              onSelectDate={(d) => setSearch({ view: 'day', date: d })}
              onSelectItem={setSelected}
              height="100%"
            />
          ) : (
            <TimelineView
              days={days}
              itemsByDate={itemsByDate}
              onSelectItem={setSelected}
              onSelectDate={
                view === 'week' ? (d) => setSearch({ view: 'day', date: d }) : undefined
              }
              height="100%"
            />
          )}
        </Box>
      )}

      {pickerOpen && (
        <MonthPickerDialog
          open
          month={month}
          onClose={() => setPickerOpen(false)}
          onSelect={(m) => {
            setPickerOpen(false);
            // 今の月なら今日、それ以外は 1 日へ
            setSearch({ date: m === toMonthString(today()) ? today() : (`${m}-01` as DateString) });
          }}
        />
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
