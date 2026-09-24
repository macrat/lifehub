import { occurrenceKey } from '../../../shared/calendar.ts';
import type { CalendarItem } from '../events/queries.ts';

/**
 * 月・週・日・リストの表示を切り替えたときと、ホームと予定画面を行き来したときに、同じ項目が
 * その場から動いて見えるようにする名前（View Transition。前後の画面で名前が一致する要素どうしが、
 * 位置と大きさの間を補間される）。名前の付かないものはフェードする。
 *
 * 名前は文書の中で一意でなければならず、同じ名前が 2 つあると遷移そのものが行われない。そのため:
 * - 発生（繰り返しの 1 回）ごとに分ける（`occurrenceKey`。id だけでは繰り返しの回が同じ名前になる）
 * - 複数日の予定は日ごとに 1 件だが、動かすのは初日だけにする（月グリッドは週の行ごとに帯が分かれ、
 *   リストは日ごとに行が並ぶので、同じ発生が複数描かれる）。続きの日はフェードする
 * - スワイプの控えの面（`inert`）に描いてある同じ項目は対象から外す（`src/lib/theme.ts`）
 */
export function itemTransitionName(item: CalendarItem): string | undefined {
  if (item.kind === 'event' && item.dayIndex > 1) return undefined;
  // view-transition-name は CSS の識別子なので、日時に含まれる記号（: . +）はそのまま使えない
  return `item-${occurrenceKey(item)}`.replace(/[^\w-]/g, '-');
}
