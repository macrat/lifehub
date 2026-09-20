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
