import Box from '@mui/material/Box';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { AddMenu } from '../../features/calendar/components/AddMenu.tsx';
import { CalendarPane } from '../../features/calendar/components/CalendarPane.tsx';
import { CalendarToolbar } from '../../features/calendar/components/CalendarToolbar.tsx';
import { DatePickerDialog } from '../../features/calendar/components/DatePickerDialog.tsx';
import { ListView } from '../../features/calendar/components/ListView.tsx';
import { SwipePager } from '../../features/calendar/components/SwipePager.tsx';
import { defaultDraft, type EventDraft } from '../../features/calendar/draft.ts';
import { type CalendarItem, colorUserOf } from '../../features/calendar/queries.ts';
import {
  calendarSearchSchema,
  useCalendarPage,
} from '../../features/calendar/use-calendar-page.ts';
import { EventForm } from '../../features/events/components/EventForm.tsx';
import { ItemDetailSheet } from '../../features/events/components/ItemDetailSheet.tsx';
import { QuickEventForm } from '../../features/events/components/QuickEventForm.tsx';
import { defaultParticipants, type ItemFormValues } from '../../features/events/form-values.ts';
import { useCreateEvent } from '../../features/events/queries.ts';
import { useUserLabels } from '../../features/users/use-user-labels.ts';
import { APP_BAR_HEIGHT, BOTTOM_NAV_HEIGHT } from '../../lib/ui/AppShell.tsx';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';
import type { SheetDetent } from '../../lib/ui/BottomSheet.tsx';

export const Route = createFileRoute('/_authenticated/calendar')({
  validateSearch: calendarSearchSchema,
  component: CalendarPage,
});

/**
 * 月・週・日・リストの表示が画面の残り全部を占めるための高さ。
 * AppShell の main が下に確保している余白（追加ボタンの分）は負のマージンで打ち消す。
 * 基準は AppShell と同じ svh（ブラウザの URL バーなどが最大に出ている状態の高さ）。
 * dvh はそれらの出入りで値が変わるので、再読み込みの直後に画面より高くなってスクロールが要る表示になる。
 */
const FILL_HEIGHT = {
  xs: `calc(100svh - ${APP_BAR_HEIGHT}px - ${BOTTOM_NAV_HEIGHT}px - env(safe-area-inset-top) - env(safe-area-inset-bottom))`,
  md: `calc(100svh - ${APP_BAR_HEIGHT}px - 8px)`,
};
const FILL_MARGIN_BOTTOM = { xs: '-96px', md: -12 };

/** 追加しようとしている予定 */
type Draft = {
  /** グリッドに出す枠 */
  range: EventDraft;
  /** 選んでいる参加者。枠の色もこれで決まるので、入力（クイック入力）とグリッドで同じ物を見る */
  participantIds: string[];
  /** 入力を出すか（なぞっている間は出さない） */
  editing: boolean;
  /** 入力を開く段。グリッドからは下の段、追加ボタンからは全項目の段 */
  detent: SheetDetent;
};

/**
 * カレンダー。予定とタスクを 1 つの画面で、月（グリッド）・週／日（タイムライン）・リストの 4 通りに表示する。
 * - 日をタップするとその日の日表示へ。左右のスワイプで前後の月・週・日へ
 * - 見出しをタップすると年月・週・日の選択ダイアログ
 * - グリッドをなぞると、その範囲の予定を追加できる（`draft`。クイック入力 →「その他のオプション」で全項目のフォーム）
 * - 追加ボタンの「予定」もここへ来る（`add=event`）。日表示に既定の時間帯を置き、入力を上の段で開く
 */
function CalendarPage() {
  const search = Route.useSearch();
  const page = useCalendarPage(search);
  const { view } = page;

  const createEvent = useCreateEvent();
  const { meId } = useUserLabels();
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftValues, setDraftValues] = useState<ItemFormValues | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // 面に渡す関数は固定する（毎回別の関数だと面が描き直しを省けない。CalendarPane 参照）
  // 枠を動かしても選んだ参加者はそのまま持ち越す（選び直しと同じ扱いにすると色と選択が戻ってしまう）
  const changeDraft = useCallback(
    (range: EventDraft, editing: boolean) =>
      setDraft((prev) => ({
        participantIds: prev?.participantIds ?? defaultParticipants(meId),
        range,
        editing,
        detent: 'peek',
      })),
    [meId],
  );

  // 追加ボタンから来たら、その日の既定の時間帯を枠にして全項目の段から始める。
  // しるしは使ったらすぐ消す（履歴に積まず、再読み込みで開き直さない）
  const { setSearch } = page;
  const addEvent = search.add === 'event';
  useEffect(() => {
    if (!addEvent) return;
    setDraft({
      range: defaultDraft(page.date),
      participantIds: defaultParticipants(meId),
      editing: true,
      detent: 'full',
    });
    setSearch({ add: undefined }, { replace: true });
  }, [addEvent, page.date, meId, setSearch]);

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
                draftUserId={draft ? colorUserOf(draft.participantIds) : null}
                onChangeDraft={changeDraft}
                hourHeight={page.hourHeight}
                onZoom={page.zoom}
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
          participantIds={draft.participantIds}
          onChangeParticipants={(participantIds) =>
            setDraft((prev) => prev && { ...prev, participantIds })
          }
          open={draft.editing}
          initialDetent={draft.detent}
          onSubmit={(input) => createEvent.mutateAsync(input)}
          onChangeDraft={(range) => setDraft((prev) => prev && { ...prev, range, editing: true })}
          onExpand={(values) => {
            setDraftValues(values);
            setDraft(null);
          }}
          onClose={() => setDraft(null)}
        />
      )}
      {draftValues && (
        <EventForm
          initial={draftValues}
          onSubmit={(input) => createEvent.mutateAsync(input)}
          onClose={() => setDraftValues(null)}
        />
      )}
    </>
  );
}
