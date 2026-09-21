import { startTransition, useEffect, useState } from 'react';
import type { DateString } from '../../../shared/types.ts';
import { type CalendarItem, groupByDate, useCalendarItems } from './queries.ts';

/** まだ予定を載せていない面。描画のたびに空の Map を作らないよう 1 つを使い回す */
const NO_ITEMS: Map<DateString, CalendarItem[]> = new Map();

/**
 * スワイプの 1 面（CalendarPane）に出す予定を placementDate ごとにまとめて返す。
 * カレンダーの枠（日付の並び・曜日・今日）は表示する期間だけで決まるので、予定は枠を描き終えた
 * 次の描画に回す。取得が済んでいるかどうかに関わらず、枠は待たずに出て、予定は後から載る。
 *
 * WHY: 左右のスワイプは router の遷移（transition）で日付を移すため、SwipePager はその描画が
 * 終わるまで面を中央に戻せない。戻るまでは端に張り付いたままで、続けてスワイプしても動かない
 * （「詰まる」）。1 面の描画のうち予定が占める量は枠と同じくらいあるので、切り離すだけで
 * 中央に戻るのがその分早くなり、スワイプを続けられる。
 *
 * WHY 次の描画も transition: 描き終わる前に次のスワイプが来たら React が捨てて描き直せる。
 * 通り過ぎる月の予定を描き切ってから次へ進む、ということにならない。
 *
 * WHY NOT useDeferredValue: 低優先度への切り下げは、今の描画が緊急（クリックや取得の反映）の
 * ときにだけ効く。スワイプの描画は router が既に transition で起こしているので、値はそのまま
 * 返り、枠と同じ描画に載ってしまう。
 */
export function usePaneItems(range: {
  from: DateString;
  to: DateString;
}): Map<DateString, CalendarItem[]> {
  const { items } = useCalendarItems(range);
  const key = `${range.from}/${range.to}`;
  const [shown, setShown] = useState<{
    key: string;
    itemsByDate: Map<DateString, CalendarItem[]>;
  } | null>(null);

  useEffect(() => {
    startTransition(() => setShown({ key, itemsByDate: groupByDate(items) }));
  }, [key, items]);

  // 期間が変わった直後は前の期間の予定しか手元に無いので、新しい枠には出さない（次の描画で入れ替わる）
  return shown?.key === key ? shown.itemsByDate : NO_ITEMS;
}
