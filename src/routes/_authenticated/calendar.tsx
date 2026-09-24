import { createFileRoute } from '@tanstack/react-router';
import { AddForm } from '../../features/add/components/AddForm.tsx';
import { AddMenu } from '../../features/add/components/AddMenu.tsx';
import { CalendarToolbar } from '../../features/calendar/components/CalendarToolbar.tsx';
import { DatePickerDialog } from '../../features/calendar/components/DatePickerDialog.tsx';
import { EventComposer } from '../../features/calendar/components/EventComposer.tsx';
import { ListView } from '../../features/calendar/components/ListView.tsx';
import { PeriodPager } from '../../features/calendar/components/PeriodPager.tsx';
import { calendarSearchSchema } from '../../features/calendar/search.ts';
import { useCalendarAdd } from '../../features/calendar/use-calendar-add.ts';
import { useCalendarOverlays } from '../../features/calendar/use-calendar-overlays.ts';
import { useCalendarPage } from '../../features/calendar/use-calendar-page.ts';
import { ItemDetailSheet } from '../../features/events/components/ItemDetailSheet.tsx';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';

export const Route = createFileRoute('/_authenticated/calendar')({
  validateSearch: calendarSearchSchema,
  component: CalendarPage,
});

/**
 * カレンダー。予定とタスクを 1 つの画面で、月（グリッド）・週／日（タイムライン）・リストの 4 通りに表示する。
 * - 日をタップするとその日の日表示へ。左右のスワイプで前後の月・週・日へ
 * - 項目をタップすると詳細（`ItemDetailSheet`）。リストの行は長押しでその詳細が編集で開く
 * - 見出しをタップすると年月・週・日の選択ダイアログ
 * - グリッドをなぞると、その範囲の予定を追加できる（`draft`。クイック入力 →「その他のオプション」で全項目のフォーム）
 * - 予定を長押しでつまむと編集モード。枠になった予定を動かして日時を直し、同じクイック入力から保存する
 * - 追加ボタン・PWA のショートカット・ほかの画面の追加ボタンからの追加は `useCalendarAdd` が受け持つ
 */
function CalendarPage() {
  const search = Route.useSearch();
  const page = useCalendarPage(search);
  const { view } = page;
  const add = useCalendarAdd(page, search.add);
  const { draft } = add.composer;
  const overlays = useCalendarOverlays(page.selectDate);
  const { selection, picker, filterPanel } = overlays;

  return (
    <>
      <AppBarContent>
        <CalendarToolbar
          view={view}
          title={page.title}
          onOpenPicker={picker.show}
          onToday={page.goToday}
          onChangeView={add.changeView}
          list={{
            query: page.filters.q,
            onChangeQuery: page.setQuery,
            filtersOpen: filterPanel.open,
            onToggleFilters: filterPanel.toggle,
            activeFilters: page.activeFilters,
          }}
        />
      </AppBarContent>

      {view === 'list' ? (
        <ListView
          date={page.date}
          filters={page.filters}
          filtersOpen={filterPanel.open}
          onChangeFilters={(next) => page.setSearch(next, { replace: true })}
          onSelectItem={selection.open}
        />
      ) : (
        <PeriodPager
          view={view}
          pages={page.pages}
          onMove={page.move}
          onSelectDate={page.openDay}
          onSelectItem={selection.open}
          draft={draft}
          onChangeDraft={add.composer.grab}
          hourHeight={page.hourHeight}
          onZoom={page.zoom}
          fitItems={page.fromMonth}
          bottomInset={overlays.sheetInset}
        />
      )}

      {picker.open && view !== 'list' && (
        <DatePickerDialog
          unit={view}
          date={page.date}
          onClose={picker.close}
          onSelect={picker.select}
        />
      )}

      {/* 追加ボタンはクイック入力と場所が重なるので、下書きの間は引っ込める */}
      {!draft && (
        <AddMenu kinds={['task', 'event']} onSelect={add.openForm} onAddEvent={add.addEvent} />
      )}
      {selection.selected && (
        <ItemDetailSheet
          item={selection.selected.record}
          initialEditing={selection.selected.editing}
          onClose={selection.close}
        />
      )}
      {add.adding && <AddForm kind={add.adding} onClose={add.closeForm} />}
      <EventComposer
        composer={add.composer}
        onClose={add.closeComposer}
        onChangeInset={overlays.setSheetInset}
      />
    </>
  );
}
