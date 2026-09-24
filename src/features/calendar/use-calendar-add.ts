import { useState } from 'react';
import type { DateString } from '../../../shared/types.ts';
import { useAddShortcut } from '../../lib/add-search.ts';
import type { AddFormKind } from '../add/kinds.ts';
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
 * カレンダー画面での追加。予定は下書きを置いて入力し（`useEventComposer`）、ほかの種類はその場で
 * フォームを開く（`adding`）。追加ボタンと PWA のショートカットのどちらから来ても、開いている入力はこの 1 つ。
 *
 * 追加ボタンの「予定」は今の表示に既定の時間帯の下書きを置き、入力を上の段で開く。月・リストには
 * 時間軸が無いので、入力を閉じるまで日表示を出し、閉じたら元の表示に戻す（`previewDay`）。
 * ほかの画面の追加ボタンから来たとき（`add=event` など）は、閉じたらその画面へ戻る
 * （`useAddShortcut` が返す関数）。
 */
export function useCalendarAdd(page: CalendarPageControls, add: CalendarSearch['add']) {
  const { meId } = useUserLabels();
  // 予定の入力（下書き・クイック入力・全項目のフォーム）。状態と移り変わりはフックが 1 つで持つ
  const composer = useEventComposer(meId);
  const [adding, setAdding] = useState<AddFormKind | null>(null);

  /** 追加ボタンからの予定の入力。月・リストには時間軸が無いので、閉じるまで日表示を出す */
  const addEvent = () => {
    page.previewDay();
    composer.start(page.date);
  };
  const finishShortcut = useAddShortcut(add, (kind) =>
    kind === 'event' ? addEvent() : setAdding(kind),
  );

  return {
    composer,
    /** その場で開いているフォームの種類（予定以外） */
    adding,
    addEvent,
    openForm: setAdding,
    /** 表示の切り替え。入力中の下書きは表示を切り替えても残るので、見失わないようその初日を連れていく */
    changeView: (view: CalendarView) =>
      page.changeView(view, composer.draft ? draftDays(composer.draft.range).from : undefined),
    closeForm: () => setAdding(null),
    /**
     * 予定の入力（クイック入力・全項目のフォーム。同時に開くのはどちらか 1 つ）を閉じた。
     * 保存でも取り消しでも同じ。ほかの画面の追加ボタンから来ていればその画面へ戻り、
     * そうでなければ元の表示に戻す
     */
    closeComposer: () => {
      composer.close();
      if (!finishShortcut()) page.endPreview();
    },
  };
}
