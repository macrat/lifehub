import Box from '@mui/material/Box';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { AddMenu } from '../../features/calendar/components/AddMenu.tsx';
import { CalendarPane } from '../../features/calendar/components/CalendarPane.tsx';
import { CalendarToolbar } from '../../features/calendar/components/CalendarToolbar.tsx';
import { DatePickerDialog } from '../../features/calendar/components/DatePickerDialog.tsx';
import { ListView } from '../../features/calendar/components/ListView.tsx';
import { SwipePager } from '../../features/calendar/components/SwipePager.tsx';
import type { EventDraft } from '../../features/calendar/draft.ts';
import type { CalendarItem } from '../../features/calendar/queries.ts';
import {
  calendarSearchSchema,
  useCalendarPage,
} from '../../features/calendar/use-calendar-page.ts';
import { EventForm } from '../../features/events/components/EventForm.tsx';
import { ItemDetailSheet } from '../../features/events/components/ItemDetailSheet.tsx';
import { QuickEventForm } from '../../features/events/components/QuickEventForm.tsx';
import type { ItemFormValues } from '../../features/events/form-values.ts';
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
 * - 日をタップするとその日の日表示へ。左右のスワイプで前後の月・週・日へ
 * - 見出しをタップすると年月・週・日の選択ダイアログ
 * - グリッドをなぞると、その範囲の予定を追加できる（`draft`。クイック入力 →「その他のオプション」で全項目のフォーム）
 */
function CalendarPage() {
  const page = useCalendarPage(Route.useSearch());
  const { view } = page;

  const createEvent = useCreateEvent();
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  // 追加しようとしている予定。editing はポインタを離した後（なぞっている間は入力を出さない）
  const [draft, setDraft] = useState<{ range: EventDraft; editing: boolean } | null>(null);
  const [draftValues, setDraftValues] = useState<ItemFormValues | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // 面に渡す関数は固定する（毎回別の関数だと面が描き直しを省けない。CalendarPane 参照）
  const changeDraft = useCallback(
    (range: EventDraft, editing: boolean) => setDraft({ range, editing }),
    [],
  );

  return (
    <>
      <AppBarContent>
        <CalendarToolbar
          view={view}
          title={page.title}
          onOpenPicker={() => setPickerOpen(true)}
          onToday={page.goToday}
          onChangeView={(view) => page.setSearch({ view })}
          list={{
            query: page.filters.q,
            onChangeQuery: page.setQuery,
            filtersOpen,
            onToggleFilters: () => setFiltersOpen((v) => !v),
            activeFilters: page.activeFilters,
          }}
        />
      </AppBarContent>

      {view === 'list' ? (
        <ListView
          filters={page.filters}
          filtersOpen={filtersOpen}
          onChangeFilters={(next) => page.setSearch(next, { replace: true })}
          onSelectItem={setSelected}
        />
      ) : (
        <Box sx={{ height: FILL_HEIGHT, mb: FILL_MARGIN_BOTTOM }}>
          <SwipePager pages={page.pages} onMove={page.move}>
            {(date, offset) => (
              <CalendarPane
                view={view}
                date={date}
                onSelectDate={page.openDay}
                onSelectItem={setSelected}
                // 下書きは表示中の面にだけ出す（前後の面は控えなので、同じ枠が二重に出ないように）
                draft={offset === 0 ? (draft?.range ?? null) : null}
                onChangeDraft={changeDraft}
              />
            )}
          </SwipePager>
        </Box>
      )}

      {pickerOpen && view !== 'list' && (
        <DatePickerDialog
          unit={view}
          date={page.date}
          onClose={() => setPickerOpen(false)}
          onSelect={(date) => {
            setPickerOpen(false);
            page.selectDate(date);
          }}
        />
      )}

      {/* 追加ボタンはクイック入力と場所が重なるので、下書きの間は引っ込める */}
      {!draft && <AddMenu kinds={['task', 'event']} date={page.date} />}
      {selected && <ItemDetailSheet item={selected} onClose={() => setSelected(null)} />}
      {draft && (
        <QuickEventForm
          draft={draft.range}
          open={draft.editing}
          onSubmit={(input) => createEvent.mutateAsync(input)}
          onChangeDraft={(range) => setDraft({ range, editing: true })}
          onExpand={(values) => {
            setDraftValues(values);
            setDraft(null);
          }}
          onClose={() => setDraft(null)}
        />
      )}
      {draftValues && (
        <EventForm
          title="予定を追加"
          initial={draftValues}
          onSubmit={(input) => createEvent.mutateAsync(input)}
          onClose={() => setDraftValues(null)}
        />
      )}
    </>
  );
}
