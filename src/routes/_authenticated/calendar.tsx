import { createFileRoute } from '@tanstack/react-router';
import type { CalendarItem } from '../../../shared/calendar.ts';
import { CalendarToolbar } from '../../features/calendar/components/CalendarToolbar.tsx';
import { DatePickerDialog } from '../../features/calendar/components/DatePickerDialog.tsx';
import { EventComposer } from '../../features/calendar/components/EventComposer.tsx';
import { ListView } from '../../features/calendar/components/ListView.tsx';
import { PeriodPager } from '../../features/calendar/components/PeriodPager.tsx';
import {
  calendarMonthQueryOptions,
  useRefreshCalendarItems,
} from '../../features/calendar/queries.ts';
import { calendarSearchSchema } from '../../features/calendar/search.ts';
import { useCalendarAdd } from '../../features/calendar/use-calendar-add.ts';
import { useCalendarPage } from '../../features/calendar/use-calendar-page.ts';
import { ItemDetailSheet } from '../../features/events/components/ItemDetailSheet.tsx';
import { ADD_PAGES } from '../../lib/add-pages.ts';
import { useScreenQueries } from '../../lib/screen-data.ts';
import { AddMenu } from '../../lib/ui/AddMenu.tsx';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';
import { useRecordSelection } from '../../lib/ui/use-record-selection.ts';

export const Route = createFileRoute('/_authenticated/calendar')({
  validateSearch: calendarSearchSchema,
  component: CalendarPage,
});

/**
 * カレンダー。予定とタスクを 1 つの画面で、月（グリッド）・週／日（タイムライン）・リストの 4 通りに表示する。
 * - 日をタップするとその日の日表示へ。左右のスワイプで前後の月・週・日へ
 * - 項目をタップすると詳細（`ItemDetailSheet`）。リストの行は長押しでその詳細が編集で開く
 * - 見出しをタップすると年月・週・日の選択ダイアログ
 * - グリッドをなぞると、その範囲の予定を追加できる（`draft`。クイック入力 →「その他のオプション」で全項目のフォーム）。
 *   クイック入力の上端で予定とタスクを切り替えられる
 * - 予定を長押しでつまむと編集モード。枠になった予定を動かして日時を直し、同じクイック入力から保存する
 * - 追加ボタン・PWA のショートカット・ほかの画面の追加ボタンからの追加は `useCalendarAdd` が受け持つ
 */
function CalendarPage() {
  const search = Route.useSearch();
  // この画面が読むもの: 出している月（面・リスト・選択ダイアログ）の項目と祝日・天気。
  // 取り直しは画面に入ったときだけ（`useRefreshCalendarItems`）。表示や日付の切り替えは検索パラメータが
  // 変わるだけでこの画面に留まるので、取り直さず手元のキャッシュをそのまま出す
  useRefreshCalendarItems();
  const page = useCalendarPage(search);
  useScreenQueries(page.months.map(calendarMonthQueryOptions));
  const { view } = page;
  const add = useCalendarAdd(page, search.add);
  const { draft } = add.composer;
  const selection = useRecordSelection<CalendarItem>();

  return (
    <>
      <AppBarContent>
        <CalendarToolbar
          view={view}
          title={page.title}
          onOpenPicker={page.picker.open}
          onToday={page.goToday}
          onChangeView={add.changeView}
          search={page.filter}
        />
      </AppBarContent>

      {view === 'list' ? (
        <ListView
          date={page.date}
          filters={page.filter.filters}
          listMonths={page.list}
          filtersOpen={page.filter.panelOpen}
          onChangeFilters={page.filter.setFilters}
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
          bottomInset={add.sheetInset}
        />
      )}

      {page.picker.month && view !== 'list' && (
        <DatePickerDialog
          unit={view}
          date={page.date}
          month={page.picker.month}
          onChangeMonth={page.picker.setMonth}
          onClose={page.picker.close}
          onSelect={(date) => {
            page.picker.close();
            page.selectDate(date);
          }}
        />
      )}

      {/* 追加ボタンはクイック入力と場所が重なるので、下書きの間は引っ込める */}
      {!draft && (
        <AddMenu label="予定・タスクを追加" kinds={ADD_PAGES['/calendar']} onSelect={add.addItem} />
      )}
      {selection.selected && (
        <ItemDetailSheet
          item={selection.selected.record}
          initialEditing={selection.selected.editing}
          onClose={selection.close}
        />
      )}
      <EventComposer
        composer={add.composer}
        onClose={add.closeComposer}
        onChangeInset={add.setSheetInset}
      />
    </>
  );
}
