import { useState } from 'react';
import type { DateString } from '../../../shared/types.ts';
import { useFilterPanel } from '../../lib/search.ts';
import { useRecordSelection } from '../../lib/ui/use-record-selection.ts';
import type { CalendarItem } from '../events/queries.ts';

/**
 * カレンダー画面で URL に載せない、重ねて開くものの状態: 項目の詳細、日付の選択ダイアログ、
 * リスト表示の詳細な絞り込み、クイック入力のシートが下から覆う高さ。
 * 表示・日付・絞り込みの値（URL の状態）は `useCalendarPage`、追加の入力は `useCalendarAdd` が持つ。
 */
export function useCalendarOverlays(selectDate: (date: DateString) => void) {
  const selection = useRecordSelection<CalendarItem>();
  const [pickerOpen, setPickerOpen] = useState(false);
  // クイック入力のシートがカレンダーを下から覆っている高さ（px）。グリッドはその分だけ
  // 下に余白を作り、シートに隠れる夜の時間帯までスクロールして見られるようにする
  const [sheetInset, setSheetInset] = useState(0);
  return {
    selection,
    /** 年月・週・日の選択ダイアログ */
    picker: {
      open: pickerOpen,
      show: () => setPickerOpen(true),
      close: () => setPickerOpen(false),
      /** 選んだら閉じてその日へ移る */
      select: (date: DateString) => {
        setPickerOpen(false);
        selectDate(date);
      },
    },
    filterPanel: useFilterPanel(),
    sheetInset,
    setSheetInset,
  };
}
