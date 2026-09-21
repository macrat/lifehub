import Box from '@mui/material/Box';
import { createFileRoute } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { AddMenu } from '../../features/calendar/components/AddMenu.tsx';
import { CalendarToolbar } from '../../features/calendar/components/CalendarToolbar.tsx';
import { ListView } from '../../features/calendar/components/ListView.tsx';
import { MonthGrid } from '../../features/calendar/components/MonthGrid.tsx';
import { MonthPickerDialog } from '../../features/calendar/components/MonthPickerDialog.tsx';
import { TimelineView } from '../../features/calendar/components/TimelineView.tsx';
import {
  type CalendarItem,
  groupByDate,
  useCalendarItems,
} from '../../features/calendar/queries.ts';
import {
  calendarSearchSchema,
  useCalendarPage,
} from '../../features/calendar/use-calendar-page.ts';
import { useSwipe } from '../../features/calendar/use-swipe.ts';
import type { TimeSelection } from '../../features/calendar/use-time-drag.ts';
import { EventForm } from '../../features/events/components/EventForm.tsx';
import { ItemDetailDialog } from '../../features/events/components/ItemDetailDialog.tsx';
import { eventValuesForRange } from '../../features/events/form-values.ts';
import { useCreateEvent } from '../../features/events/queries.ts';
import { APP_BAR_HEIGHT, BOTTOM_NAV_HEIGHT } from '../../lib/ui/AppShell.tsx';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';

export const Route = createFileRoute('/_authenticated/calendar')({
  validateSearch: calendarSearchSchema,
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
 * - 週・日表示では時間軸をドラッグすると、その時間帯の予定を追加できる
 */
function CalendarPage() {
  const page = useCalendarPage(Route.useSearch());
  const { items } = useCalendarItems(page.range);
  const itemsByDate = groupByDate(items);

  const createEvent = useCreateEvent();
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [range, setRange] = useState<TimeSelection | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const swipeRef = useRef<HTMLDivElement>(null);
  useSwipe(swipeRef, { onSwipeLeft: () => page.move(1), onSwipeRight: () => page.move(-1) });

  return (
    <>
      <AppBarContent>
        <CalendarToolbar
          view={page.view}
          title={page.title}
          onOpenPicker={() => setPickerOpen(true)}
          onToday={page.goToday}
          onChangeView={(view) => page.setSearch({ view })}
          list={{
            query: page.filters.q,
            onChangeQuery: (q) => page.setSearch({ q: q || undefined }, { replace: true }),
            filtersOpen,
            onToggleFilters: () => setFiltersOpen((v) => !v),
            activeFilters: page.activeFilters,
          }}
        />
      </AppBarContent>

      {page.view === 'list' ? (
        <ListView
          items={items}
          filters={page.filters}
          filtersOpen={filtersOpen}
          onChangeFilters={(next) =>
            page.setSearch(
              { ...next, q: next.q === undefined ? undefined : next.q || undefined },
              { replace: true },
            )
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
          {page.view === 'month' ? (
            <MonthGrid
              month={page.month}
              days={page.days}
              itemsByDate={itemsByDate}
              onSelectDate={page.openDay}
              onSelectItem={setSelected}
              height="100%"
            />
          ) : (
            <TimelineView
              days={page.days}
              itemsByDate={itemsByDate}
              onSelectItem={setSelected}
              onSelectDate={page.view === 'week' ? page.openDay : undefined}
              onSelectRange={setRange}
              height="100%"
            />
          )}
        </Box>
      )}

      {pickerOpen && (
        <MonthPickerDialog
          month={page.month}
          onClose={() => setPickerOpen(false)}
          onSelect={(m) => {
            setPickerOpen(false);
            page.selectMonth(m);
          }}
        />
      )}

      <AddMenu kinds={['task', 'event']} date={page.date} />
      {selected && <ItemDetailDialog item={selected} onClose={() => setSelected(null)} />}
      {range && (
        <EventForm
          title="予定を追加"
          initial={eventValuesForRange(range.date, range.startMin, range.endMin)}
          onSubmit={(input) => createEvent.mutateAsync(input)}
          onClose={() => setRange(null)}
        />
      )}
    </>
  );
}
