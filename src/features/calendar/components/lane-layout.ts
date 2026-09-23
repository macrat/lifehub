import { isCompletedTask, occurrenceKey } from '../../../../shared/calendar.ts';
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

/** 描いた 1 項目の鍵（React の key）。複数日の予定は日ごとに別の項目なので、発生に暦日を足す */
export function itemKey(item: CalendarItem): string {
  return `${occurrenceKey(item)}:${item.placementDate}`;
}

/**
 * 並んだ日（1 週など）の項目にレーン（行）を割り当てる（Google カレンダーの月表示の並べ方）。
 * 複数日の予定は 1 本の帯にまとめ、開始が早く長いものから上に置く。次に日ごとの項目を左から順に空いた行へ詰める。
 * 日ごとの項目は渡された順に上から詰まるので、渡す順がそのままレーンの順になる（入りきらない分を
 * 畳む呼び出し側では、後ろに回した項目ほど先に畳まれる。`completedLast`）。
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
        const key = occurrenceKey(item);
        if (seenBars.has(key)) continue;
        seenBars.add(key);
        const continues = (day: DateString | undefined) =>
          day !== undefined && (itemsByDate.get(day) ?? []).some((i) => occurrenceKey(i) === key);
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
 * 完了したタスクを日ごとに一番後ろへ回した並び。
 * 月グリッドは入りきらないレーンを「+n」に畳むので、セルに残すべきなのは未完了の項目。
 * 一覧の並び（`shared/calendar.ts` の `sortItems`）は完了したタスクもその時刻（`taskTime`）に置くので、
 * そのままでは完了したタスクが、時刻の無い未完了のタスクやあとの時刻の予定より前に場所を取ってしまう。
 * 畳まない所（週・日の終日欄）は落ちる項目が無いので、そのまま `layoutLanes` に渡す。
 */
export function completedLast(
  itemsByDate: Map<DateString, CalendarItem[]>,
): Map<DateString, CalendarItem[]> {
  return new Map(
    [...itemsByDate].map(([date, items]) => [
      date,
      // sort は安定なので、完了していない項目どうしの順は元のまま
      [...items].sort((a, b) => Number(isCompletedTask(a)) - Number(isCompletedTask(b))),
    ]),
  );
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

/**
 * 行の高さに入りきらないレーンを「+n」に畳む（月グリッドの 1 週）。
 * 入りきるなら全部出す。入りきらなければ最後のレーンを「+n」の行に譲り、そこから下の項目を列ごとに数える
 * （複数日の帯は掛かる列すべてに数える）。
 * - visible: 出す項目
 * - foldedLane: 「+n」を置くレーン（畳む物が無ければ出すレーンの数と同じ）
 * - foldedPerCol: 列ごとの畳んだ数
 */
export function foldLanes(
  placed: Placed[],
  maxLanes: number,
  columns: number,
): { visible: Placed[]; foldedLane: number; foldedPerCol: number[] } {
  const overflow = placed.some((p) => p.lane >= maxLanes);
  const foldedLane = overflow ? maxLanes - 1 : maxLanes;
  const foldedPerCol = new Array<number>(columns).fill(0);
  for (const p of placed) {
    if (p.lane < foldedLane) continue;
    for (let c = p.col; c < p.col + p.span; c++) foldedPerCol[c] = (foldedPerCol[c] ?? 0) + 1;
  }
  return { visible: placed.filter((p) => p.lane < foldedLane), foldedLane, foldedPerCol };
}
