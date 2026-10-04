import { memo, useMemo } from 'react';
import { type CalendarItem, groupByDate } from '../../../../shared/calendar.ts';
import type { DateString } from '../../../../shared/types.ts';
import { useCalendarItems } from '../../events/queries.ts';
import type { Draft } from '../draft.ts';
import type { GridDraft } from '../grid-draft.ts';
import { type PeriodView, periodOf } from '../use-calendar-page.ts';
import { MonthGrid } from './MonthGrid.tsx';
import { TimelineView } from './TimelineView.tsx';

type Props = {
  view: PeriodView;
  /** この面が受け持つページを代表する日（月なら 1 日）。期間はここから組み立てる */
  date: DateString;
  onSelectDate: (date: DateString) => void;
  onSelectItem: (item: CalendarItem) => void;
  /**
   * 追加・編集しようとしている予定の枠。控えの面には出さないので null が来る。
   * 枠の色（選んでいる参加者）と、なぞり終えたか（終えるまでは枠を追いかけてスクロールしない）もここから読む
   */
  draft: GridDraft | null;
  /** グリッドをなぞって範囲を決めたとき。done はポインタを離したか */
  onChangeDraft: (draft: Draft, done: boolean) => void;
  /** 週・日の時間軸へそのまま渡す（`use-hour-zoom.ts`。3 面で同じ値を使う） */
  hourHeight: number;
  onZoom: (ratio: number) => void;
  /** 週・日の時間軸へそのまま渡す（最初の縦位置を予定に合わせるか） */
  fitItems: boolean;
  /** クイック入力のシートが下から覆っている高さ（px）。その分だけ下に余白を足してスクロールできるようにする */
  bottomInset: number;
};

/**
 * カレンダー 1 ページ分（1 か月・1 週・1 日）の表示。スワイプでは前後のページも同時に描くので、
 * 項目は面ごとに自分の範囲を読む（前後の分が先に読まれていて、スワイプした先も取得済み）。
 * 手元にまだ無い月は枠（日付の並び・曜日・今日）だけを出して待つ（枠そのものが骨組みになる）。
 * 描く量を抑えるための面の出し分けは入れ物（SwipePager）が受け持つので、ここは待たずに描き切る。
 *
 * memo: スワイプで 1 つ進んでも 3 面のうち 2 面は同じページのままなので、props が変わらなければ
 * 描き直さない。新しく要る端の 1 面は入れ物が次の描画に回すので、移動そのものの描画は空になる
 * （SwipePager 参照）。props は日付・表示のような値だけにし、渡す関数は呼び出し側で固定しておくこと。
 */
export const CalendarPane = memo(function CalendarPane({
  view,
  date,
  onSelectDate,
  onSelectItem,
  draft,
  onChangeDraft,
  hourHeight,
  onZoom,
  fitItems,
  bottomInset,
}: Props) {
  const period = useMemo(() => periodOf(view, date), [view, date]);
  const { data: items } = useCalendarItems(period.range);
  const itemsByDate = useMemo(() => groupByDate(items ?? []), [items]);

  return view === 'month' ? (
    <MonthGrid
      month={period.month}
      days={period.days}
      itemsByDate={itemsByDate}
      onSelectDate={onSelectDate}
      onSelectItem={onSelectItem}
      draft={draft}
      onChangeDraft={onChangeDraft}
      height="100%"
      bottomInset={bottomInset}
    />
  ) : (
    <TimelineView
      days={period.days}
      itemsByDate={itemsByDate}
      onSelectItem={onSelectItem}
      onSelectDate={view === 'week' ? onSelectDate : undefined}
      draft={draft}
      onChangeDraft={onChangeDraft}
      height="100%"
      hourHeight={hourHeight}
      onZoom={onZoom}
      fitItems={fitItems}
      bottomInset={bottomInset}
    />
  );
});
