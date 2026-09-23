import { type CalendarItem, taskTimeOnPlacementDate } from '../../../../shared/calendar.ts';
import { DAY_MINUTES } from '../../../../shared/constants.ts';
import type { DateString } from '../../../../shared/types.ts';
import { minutesOfDay } from '../../../lib/date.ts';
import { itemKey } from './lane-layout.ts';

/**
 * タイムライン（週・日表示）で、同じ時間帯に重なる項目を横に並べるための配置計算。
 * Google カレンダーと同じく、重なり合う項目の集まり（クラスタ）ごとに列を割り当て、幅を等分する。
 */
export type TimedInput<T> = {
  key: string;
  item: T;
  /** 0:00 からの分 */
  startMin: number;
  /** 0:00 からの分（排他的） */
  endMin: number;
};

export type TimedPlaced<T> = TimedInput<T> & {
  /** 0 始まりの列 */
  col: number;
  /** クラスタ内の列数 */
  cols: number;
};

/** 重なりの判定に使う最小の長さ（分）。短い予定でもタイトルが読める高さを確保する */
export const MIN_BLOCK_MINUTES = 30;

export function layoutTimed<T>(inputs: TimedInput<T>[]): TimedPlaced<T>[] {
  const sorted = inputs
    .map((i) => ({ ...i, endMin: Math.max(i.endMin, i.startMin + MIN_BLOCK_MINUTES) }))
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const result: TimedPlaced<T>[] = [];
  let cluster: TimedPlaced<T>[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    for (const p of cluster) p.cols = columnEnds.length;
    result.push(...cluster);
    cluster = [];
    columnEnds = [];
  };

  for (const input of sorted) {
    if (input.startMin >= clusterEnd) flush();
    let col = columnEnds.findIndex((end) => end <= input.startMin);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(input.endMin);
    } else {
      columnEnds[col] = input.endMin;
    }
    clusterEnd = Math.max(clusterEnd, input.endMin);
    cluster.push({ ...input, col, cols: 0 });
  }
  flush();
  // 呼び出し側が元の endMin で高さを決められるように、伸ばした endMin は入力の値に戻す
  const originalEnd = new Map(inputs.map((i) => [i.key, i.endMin]));
  return result.map((p) => ({ ...p, endMin: originalEnd.get(p.key) ?? p.endMin }));
}

/**
 * 時間軸に置く時間指定の予定の時間帯（分）。終日・複数日は時間軸に置けないので null。
 * 24:00 に終わる予定は翌日 0:00 で届くので 24 時に読み替える。
 * 時間軸のブロックと、長押しでつまんだときの枠（`draft.ts` の `itemDraft`）が同じ規則で決まるので、
 * 置いた所をそのままつまめる。
 */
export function timedSlot(item: CalendarItem): { startMin: number; endMin: number } | null {
  if (item.kind !== 'event' || item.allDay || item.dayCount > 1) return null;
  return {
    startMin: minutesOfDay(item.startsAt),
    endMin: minutesOfDay(item.endsAt) || DAY_MINUTES,
  };
}

/**
 * 時間軸に置く項目の時間帯（分）。終日・複数日の予定と、時刻の無い（日付だけ、または別の日の時刻の）タスクは
 * null（終日欄へ）。タスクはその時刻に最小の長さのブロックで置く。
 */
function timelineSlot(item: CalendarItem): { startMin: number; endMin: number } | null {
  if (item.kind === 'event') return timedSlot(item);
  const time = taskTimeOnPlacementDate(item);
  if (!time?.at) return null;
  const startMin = minutesOfDay(time.at);
  return { startMin, endMin: startMin + MIN_BLOCK_MINUTES };
}

/**
 * 週・日のタイムラインの振り分け: 日ごとの項目を終日欄（そのまま。レーンは `layoutLanes` が割り当てる）と
 * 時間軸（重なりを列に割り当て済み）に分ける。
 */
export function partitionTimeline(
  days: DateString[],
  itemsByDate: Map<DateString, CalendarItem[]>,
): {
  allDayByDate: Map<DateString, CalendarItem[]>;
  timedByDate: Map<DateString, TimedPlaced<CalendarItem>[]>;
} {
  const allDayByDate = new Map<DateString, CalendarItem[]>();
  const timedByDate = new Map<DateString, TimedPlaced<CalendarItem>[]>();
  for (const day of days) {
    const allDay: CalendarItem[] = [];
    const timed: TimedInput<CalendarItem>[] = [];
    for (const item of itemsByDate.get(day) ?? []) {
      const slot = timelineSlot(item);
      if (slot) timed.push({ key: itemKey(item), item, ...slot });
      else allDay.push(item);
    }
    allDayByDate.set(day, allDay);
    timedByDate.set(day, layoutTimed(timed));
  }
  return { allDayByDate, timedByDate };
}
