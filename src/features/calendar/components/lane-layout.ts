import type { DateString } from '../../../../shared/types.ts';
import type { CalendarItem } from '../queries.ts';

export type Placed = {
  key: string;
  item: CalendarItem;
  /** 0 始まりの列（days の添字） */
  col: number;
  /** またぐ列数 */
  span: number;
  /** 0 始まりの行 */
  lane: number;
  /** 帯の左端が本当の開始日か（違えば前の週から続いている） */
  roundStart: boolean;
  /** 帯の右端が本当の終了日か */
  roundEnd: boolean;
};

export function itemKey(item: CalendarItem): string {
  return `${item.kind}:${item.id}:${item.occurrenceStart}:${item.placementDate}`;
}

/**
 * 並んだ日（1 週など）の項目にレーン（行）を割り当てる（Google カレンダーの月表示の並べ方）。
 * 複数日の予定は 1 本の帯にまとめ、開始が早く長いものから上に置く。次に日ごとの項目を左から順に空いた行へ詰める。
 * API は複数日の予定を日ごとに 1 件（dayIndex / dayCount）で返すので、ここで束ねる。
 */
export function layoutLanes(
  days: DateString[],
  itemsByDate: Map<DateString, CalendarItem[]>,
): Placed[] {
  const n = days.length;
  const entries: Omit<Placed, 'lane'>[] = [];
  const seenBars = new Set<string>();
  days.forEach((day, col) => {
    for (const item of itemsByDate.get(day) ?? []) {
      if (item.kind === 'event' && item.dayCount > 1) {
        const key = `${item.id}:${item.occurrenceStart}`;
        if (seenBars.has(key)) continue;
        seenBars.add(key);
        const continues = (day: DateString | undefined) =>
          day !== undefined &&
          (itemsByDate.get(day) ?? []).some(
            (i) => i.kind === 'event' && `${i.id}:${i.occurrenceStart}` === key,
          );
        let span = 1;
        while (continues(days[col + span])) span++;
        entries.push({
          key,
          item,
          col,
          span,
          roundStart: item.dayIndex === 1,
          roundEnd: item.dayIndex + span - 1 === item.dayCount,
        });
      }
    }
  });
  entries.sort((a, b) => a.col - b.col || b.span - a.span);
  days.forEach((day, col) => {
    for (const item of itemsByDate.get(day) ?? []) {
      if (item.kind === 'event' && item.dayCount > 1) continue;
      entries.push({ key: itemKey(item), item, col, span: 1, roundStart: true, roundEnd: true });
    }
  });

  const lanes: boolean[][] = [];
  return entries.map((entry) => {
    let lane = 0;
    for (;;) {
      let row = lanes[lane];
      if (!row) {
        row = Array(n).fill(false);
        lanes[lane] = row;
      }
      if (row.slice(entry.col, entry.col + entry.span).every((used) => !used)) {
        row.fill(true, entry.col, entry.col + entry.span);
        break;
      }
      lane++;
    }
    return { ...entry, lane };
  });
}

/**
 * 下書きの帯を置くレーン。掛かる列がすべて空いている一番上のレーンを選び、
 * 空きが無ければ一番下のレーンに重ねる（行の高さは決まっているので、はみ出させない）。
 */
export function freeLane(placed: Placed[], col: number, span: number, maxLanes: number): number {
  for (let lane = 0; lane < maxLanes; lane++) {
    const used = placed.some((p) => p.lane === lane && p.col < col + span && col < p.col + p.span);
    if (!used) return lane;
  }
  return maxLanes - 1;
}
