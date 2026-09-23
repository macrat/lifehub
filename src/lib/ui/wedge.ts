/**
 * 複数の色を中心の周りに等分して置く向きの計算（`WedgeFill` の塗り分けと `VennMark` の円の配置）。
 * 同じ向きを両方が使うので、同じ参加者なら印とチェックボックスで同じ位置に同じ色が来る。
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
