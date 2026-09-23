import Box from '@mui/material/Box';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { AddForm } from '../../features/add/components/AddForm.tsx';
import { AddMenu } from '../../features/add/components/AddMenu.tsx';
import type { AddFormKind } from '../../features/add/kinds.ts';
import { useAddShortcut } from '../../features/add/shortcut.ts';
import { CalendarPane } from '../../features/calendar/components/CalendarPane.tsx';
import { CalendarToolbar } from '../../features/calendar/components/CalendarToolbar.tsx';
import { DatePickerDialog } from '../../features/calendar/components/DatePickerDialog.tsx';
import { ListView } from '../../features/calendar/components/ListView.tsx';
import { SwipePager } from '../../features/calendar/components/SwipePager.tsx';
import {
  type Draft,
  defaultDraft,
  draftDays,
  sameOccurrence,
} from '../../features/calendar/draft.ts';
import { type CalendarItem, colorUserOf } from '../../features/calendar/queries.ts';
import {
  calendarSearchSchema,
  useCalendarPage,
} from '../../features/calendar/use-calendar-page.ts';
import { EventForm } from '../../features/events/components/EventForm.tsx';
import { ItemDetailSheet } from '../../features/events/components/ItemDetailSheet.tsx';
import { QuickEventForm } from '../../features/events/components/QuickEventForm.tsx';
import { defaultParticipants, type ItemFormValues } from '../../features/events/form-values.ts';
import {
  type CreateEventBody,
  useCreateEvent,
  useUpdateEvent,
} from '../../features/events/queries.ts';
import { grabbedScope } from '../../features/events/recurrence-options.ts';
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

/** 追加しようとしている予定と、長押しでつまんで直している予定（`Draft` の item）の両方 */
type DraftState = Draft & {
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
 * - 項目をタップすると詳細（`ItemDetailSheet`）。リストの行は長押しでその詳細が編集で開く
 * - 見出しをタップすると年月・週・日の選択ダイアログ
 * - グリッドをなぞると、その範囲の予定を追加できる（`draft`。クイック入力 →「その他のオプション」で全項目のフォーム）
 * - 予定を長押しでつまむと編集モード。枠になった予定を動かして日時を直し、同じクイック入力から保存する
 * - 追加ボタンの「予定」は今の表示に既定の時間帯の下書きを置き、入力を上の段で開く。月・リストには時間軸が無いので、
 *   入力を閉じるまで日表示を出し、閉じたら元の表示に戻す（`previewDay`）。ほかの画面の追加ボタンと
 *   PWA のショートカットの「予定」もここへ来て同じ流れになる（`add=event`）。ほかの画面の追加ボタンから
 *   来たときは、閉じたらその画面へ戻る（`useAddShortcut` が返す関数）
 */
function CalendarPage() {
  const search = Route.useSearch();
  const page = useCalendarPage(search);
  const { view } = page;

  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const { meId } = useUserLabels();
  // 開いている項目と、どちらの顔（閲覧・編集）で開いたか
  const [selected, setSelected] = useState<{ item: CalendarItem; editing: boolean } | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  // 「その他のオプション」で全項目のフォームへ移した入力（直している予定も一緒に持ち越す）
  const [expanded, setExpanded] = useState<{
    values: ItemFormValues;
    item: CalendarItem | null;
  } | null>(null);
  // クイック入力のシートがカレンダーを下から覆っている高さ（px）。グリッドはその分だけ
  // 下に余白を作り、シートに隠れる夜の時間帯までスクロールして見られるようにする
  const [sheetInset, setSheetInset] = useState(0);
  // 追加ボタンとショートカットのどちらから来ても、開いている入力はこの 1 つ
  const [adding, setAdding] = useState<AddFormKind | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // 面に渡す関数は固定する（毎回別の関数だと面が描き直しを省けない。CalendarPane 参照）
  const viewItem = useCallback((item: CalendarItem) => setSelected({ item, editing: false }), []);
  // 同じ予定を直し続けている間は選んだ参加者をそのまま持ち越す（枠を動かすたびに色と選択が戻らない）。
  // つまむ物が変わったときは、直す予定の参加者（追加なら自分）から始める
  const changeDraft = useCallback(
    (next: Draft, editing: boolean) =>
      setDraft((prev) => ({
        ...next,
        participantIds:
          prev && sameOccurrence(prev.item, next.item)
            ? prev.participantIds
            : (next.item?.participantIds ?? defaultParticipants(meId)),
        editing,
        detent: 'peek',
      })),
    [meId],
  );

  /**
   * 下書きの保存。つまんだ予定を直しているときはその予定を上書きし、そうでなければ追加する
   * （クイック入力からでも「その他のオプション」の全項目のフォームからでも同じ）。
   */
  const save = (input: CreateEventBody, item: CalendarItem | null) => {
    if (!item) return createEvent.mutateAsync(input);
    return updateEvent.mutateAsync({
      ...input,
      id: item.id,
      scope: grabbedScope(item),
      occurrenceStart: item.occurrenceStart ?? undefined,
    });
  };

  /** 追加ボタンからの予定の入力。下書きを置く日は今見ている日（月なら代表日） */
  const addEvent = () => {
    page.previewDay();
    setDraft({
      range: defaultDraft(page.date),
      item: null,
      participantIds: defaultParticipants(meId),
      editing: true,
      detent: 'full',
    });
  };
  const finishShortcut = useAddShortcut(search.add, (kind) =>
    kind === 'task' ? setAdding('task') : addEvent(),
  );
  /**
   * 予定の入力（クイック入力・全項目のフォーム。同時に開くのはどちらか 1 つ）を閉じた。
   * 保存でも取り消しでも同じ。ほかの画面の追加ボタンから来ていればその画面へ戻り、
   * そうでなければ元の表示に戻す
   */
  const closeAdding = () => {
    setDraft(null);
    setExpanded(null);
    if (!finishShortcut()) page.endPreview();
  };

  return (
    <>
      <AppBarContent>
        <CalendarToolbar
          view={view}
          title={page.title}
          onOpenPicker={() => setPickerOpen(true)}
          onToday={page.goToday}
          // 入力中の下書きは表示を切り替えても残るので、見失わないようその初日を連れていく
          onChangeView={(view) =>
            page.changeView(view, draft ? draftDays(draft.range).from : undefined)
          }
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
          onSelectItem={(item, editing) => setSelected({ item, editing })}
        />
      ) : (
        <Box sx={{ height: FILL_HEIGHT, mb: FILL_MARGIN_BOTTOM }}>
          <SwipePager pages={page.pages} onMove={page.move}>
            {(date, offset) => (
              <CalendarPane
                view={view}
                date={date}
                onSelectDate={page.openDay}
                onSelectItem={viewItem}
                // 枠は表示中の面にだけ出す（前後の面は控えなので、同じ枠が二重に出ないように）
                draft={offset === 0 ? draft : null}
                draftUserId={draft ? colorUserOf(draft.participantIds) : null}
                onChangeDraft={changeDraft}
                hourHeight={page.hourHeight}
                onZoom={page.zoom}
                // 枠と同じく、控えの面には渡さない（props が変わらなければ面は描き直さない。
                // シートの開け閉めのたびに 3 面とも組み直さないように）。
                // 覆う高さは下部ナビの分だけ多めに取る: 基準が svh と dvh で食い違っても
                // 足りなくならない側へ倒す（余った分は下の余白が少し増えるだけ）
                bottomInset={offset === 0 ? sheetInset : 0}
                // なぞっている間は枠を追いかけない（指の下でグリッドが動くと狙いがずれる）。
                // 余白そのものは出したままにする: 途中で消すとスクロール位置が詰められて、
                // やはり指の下でグリッドが動く
                draftSettled={offset === 0 && (draft?.editing ?? false)}
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
      {!draft && (
        <AddMenu
          kinds={['task', 'event']}
          onSelect={(kind) => (kind === 'event' ? addEvent() : setAdding(kind))}
        />
      )}
      {selected && (
        <ItemDetailSheet
          item={selected.item}
          initialEditing={selected.editing}
          onClose={() => setSelected(null)}
        />
      )}
      {adding && <AddForm kind={adding} onClose={() => setAdding(null)} />}
      {draft && (
        <QuickEventForm
          draft={draft.range}
          item={draft.item}
          participantIds={draft.participantIds}
          onChangeParticipants={(participantIds) =>
            setDraft((prev) => prev && { ...prev, participantIds })
          }
          open={draft.editing}
          initialDetent={draft.detent}
          onSubmit={(input) => save(input, draft.item)}
          onChangeDraft={(range) => setDraft((prev) => prev && { ...prev, range, editing: true })}
          onExpand={(values) => {
            setExpanded({ values, item: draft.item });
            setDraft(null);
          }}
          onClose={closeAdding}
          onChangeInset={setSheetInset}
        />
      )}
      {expanded && (
        <EventForm
          initial={expanded.values}
          scope={grabbedScope(expanded.item)}
          title={expanded.item ? '予定を編集' : '予定を追加'}
          onSubmit={(input) => save(input, expanded.item)}
          onClose={closeAdding}
        />
      )}
    </>
  );
}
