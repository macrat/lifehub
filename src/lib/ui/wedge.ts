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

/**
 * 枠を塗り分ける CSS の conic-gradient（帯・ブロックの縁）。3 つは Y の字、4 つは十字の境目で、
 * 色の並びは `WedgeFill` と同じ（1 つ目が左下）。2 つだけは境目を 45° 傾け、左下と右上に分ける。
 * WHY 2 つを斜めに: 帯は横に長いので、`WedgeFill` と同じ縦の境目だと上下の辺がちょうど半分で切れるだけで、
 * 左右の 2 色に見えるだけになる。斜めにすると切れ目が縁を斜めに横切り、塗り分けだと分かる。
 * conic-gradient の角度は真上が 0° で時計回り。`wedgeAngles` の最初の境目は真下（180°）に来る。
 */
export function wedgeGradient(colors: string[]): string {
  const from = colors.length === 2 ? 135 : 180;
  const step = 360 / colors.length;
  const stops = colors.map((c, i) => `${c} ${i * step}deg ${(i + 1) * step}deg`);
  return `conic-gradient(from ${from}deg, ${stops.join(', ')})`;
}
