import { useState } from 'react';
import type { DateString } from '../../../shared/types.ts';
import type { EventKind } from '../../../shared/validation/events.ts';
import { useAddShortcut } from '../../lib/add-search.ts';
import { useUserLabels } from '../users/use-user-labels.ts';
import { draftDays } from './draft.ts';
import type { CalendarSearch } from './search.ts';
import { useEventComposer } from './use-event-composer.ts';
import type { CalendarView } from './view.ts';

/** 追加の間だけ日表示を出す仕掛けと表示の切り替え（`useCalendarPage` の一部） */
type CalendarPageControls = {
  date: DateString;
  previewDay: () => void;
  endPreview: () => void;
  changeView: (view: CalendarView, keepVisible?: DateString) => void;
};

/**
 * カレンダー画面での追加。予定もタスクも下書きを置いて入力する（`useEventComposer`）。
 * 追加ボタンと PWA のショートカットのどちらから来ても、開いている入力はこの 1 つ。
 *
 * 追加ボタンで予定かタスクを選ぶと、今見ている日の終日の下書きをその種類で置き、入力を上の段で開く
 * （入れ始めてからでも入力の上端で切り替えられる）。ショートカット（`add=event` / `add=task`）も同じ。
 * 月・リストには時間軸が無いので、入力を閉じるまで日表示を出し、閉じたら元の表示に戻す（`previewDay`）。
 */
export function useCalendarAdd(page: CalendarPageControls, add: CalendarSearch['add']) {
  const { meId } = useUserLabels();
  // 予定の入力（下書き・クイック入力・全項目のフォーム）。状態と移り変わりはフックが 1 つで持つ
  const composer = useEventComposer(meId);
  // クイック入力のシートがカレンダーを下から覆っている高さ（px）。グリッドはその分だけ
  // 下に余白を作り、シートに隠れる夜の時間帯までスクロールして見られるようにする
  const [sheetInset, setSheetInset] = useState(0);

  /** 追加の入力を始める。月・リストには時間軸が無いので、閉じるまで日表示を出す */
  const addItem = (kind: EventKind) => {
    page.previewDay();
    composer.start(page.date, kind);
  };
  useAddShortcut(add, addItem);

  return {
    composer,
    addItem,
    /** 表示の切り替え。入力中の下書きは表示を切り替えても残るので、見失わないようその初日を連れていく */
    changeView: (view: CalendarView) =>
      page.changeView(view, composer.draft ? draftDays(composer.draft.range).from : undefined),
    sheetInset,
    setSheetInset,
    /**
     * 予定の入力（クイック入力・全項目のフォーム。同時に開くのはどちらか 1 つ）を閉じた。
     * 保存でも取り消しでも同じで、元の表示に戻す
     */
    closeComposer: () => {
      composer.close();
      page.endPreview();
    },
  };
}
