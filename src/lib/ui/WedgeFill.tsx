/**
 * 複数の色を中心の周りに等分して塗る（`VennMark` と `SplitCheckboxIcon` の塗り分け）。
 * 2 つは左右、3 つは上に 1 つ足した三角（境目は Y の字）、4 つは四角（境目は十字）に分かれる。
 * 色の並びはどちらの部品でも同じなので、同じ参加者なら印とチェックボックスで同じ位置に同じ色が来る。
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
 * 原点を中心に、`colors` の色で扇形に塗り分けた面（中心から reach まで）。
 * 形は持たないので、呼び出し側が clipPath で切り抜いて使う。reach は切り抜く形より大きく取る。
 * 扇形の境目は隣り合う向きのちょうど間なので、`wedgeAngles` の向きに等距離で置いた円どうしなら
 * 境目が中心の垂直二等分線になり、どの点も最も近い円の色になる。
 */
export function WedgeFill({ colors, reach }: { colors: string[]; reach: number }) {
  const count = colors.length;
  if (count === 1) {
    return <rect x={-reach} y={-reach} width={reach * 2} height={reach * 2} fill={colors[0]} />;
  }
  const half = Math.PI / count;
  return wedgeAngles(count).map((angle, i) => (
    <polygon
      // biome-ignore lint/suspicious/noArrayIndexKey: 扇形は位置で決まり、並べ替わらない
      key={i}
      points={[
        { x: 0, y: 0 },
        pointAt(angle - half, reach),
        pointAt(angle, reach),
        pointAt(angle + half, reach),
      ]
        .map((p) => `${p.x},${p.y}`)
        .join(' ')}
      fill={colors[i]}
    />
  ));
}
