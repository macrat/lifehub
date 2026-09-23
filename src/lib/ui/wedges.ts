/**
 * 複数の色を中心の周りに等分して並べる幾何（`VennMark` の円の配置と、`SplitCheckboxIcon` の塗り分け）。
 * 2 つは左右、3 つは上に 1 つ足した三角（境目は Y の字）、4 つは四角（境目は十字）になる。
 */

/**
 * n 個を並べる向き（ラジアン、y は下向き）。始めの角度を 90° + 180°/n にすると、
 * どの数でも底辺が水平になり、1 つ目が左（2 つのとき）・左下（3 つ以上のとき）に来る。
 */
export function wedgeAngles(count: number): number[] {
  const start = Math.PI / 2 + Math.PI / count;
  return Array.from({ length: count }, (_, i) => start + (2 * Math.PI * i) / count);
}

/** 中心から角度 angle の向きに distance 離れた点 */
export function pointAt(angle: number, distance: number): { x: number; y: number } {
  return { x: distance * Math.cos(angle), y: distance * Math.sin(angle) };
}

/**
 * 角度 angle を受け持つ扇形（中心から、隣との間の角度まで）の `<polygon points>`。
 * 中心から reach まで届くので、reach を描く範囲より十分大きく取り、形で切り抜いて使う。
 * 並びが等間隔なので、扇形の境目は隣り合う向きのちょうど間になる。
 */
export function wedgePoints(angle: number, count: number, reach: number): string {
  const half = Math.PI / count;
  return [
    { x: 0, y: 0 },
    pointAt(angle - half, reach),
    pointAt(angle, reach),
    pointAt(angle + half, reach),
  ]
    .map((p) => `${p.x},${p.y}`)
    .join(' ');
}
