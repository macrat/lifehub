import { useId } from 'react';

/** 1 つの円の半径 */
const RADIUS = 5.5;

/** 隣り合う円の中心の間隔。半径と同じにして、重なりの領域を円の半分の幅まで広げ、小さくても見分けられるようにする */
const GAP = 5.5;

/** 描く枠の一辺。4 つ（四角）まで並べても収まる */
const SIZE = 20;

/**
 * 円を正多角形の頂点に置く。2 つは左右、3 つは上に 1 つ足した三角、4 つは四角になる。
 * 始めの角度を 90° + 180°/n にすると、どの数でも底辺が水平になる（y は下向き）。
 */
function centers(count: number): { x: number; y: number }[] {
  if (count === 1) return [{ x: 0, y: 0 }];
  const radius = GAP / (2 * Math.sin(Math.PI / count));
  const start = Math.PI / 2 + Math.PI / count;
  return Array.from({ length: count }, (_, i) => {
    const angle = start + (2 * Math.PI * i) / count;
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
}

/**
 * ベン図の形をした印（予定の参加者、立替の To と From）。円ごとに `colors` の色で塗り、
 * 円どうしが重なった領域は `overlap` の色で塗る。
 *
 * WHY 重なりを別の色にする: 2 色を直に接させると、補色どうしのとき境目がちらついて見づらい。
 * 間に無彩色を挟むと、どちらの色も背景から浮かせたまま見分けられる。
 * 重なりの領域はどの組み合わせでも同じ色なので、円どうしの交わりを 1 組ずつ塗るだけでよい
 * （3 つ以上が重なるところも、いずれかの組の交わりに含まれる）。
 */
export function VennMark({ colors, overlap }: { colors: string[]; overlap: string }) {
  const id = useId();
  const circles = centers(colors.length);
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`}
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <defs>
        {circles.map((c, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 円は位置で決まり、並べ替わらない
          <clipPath key={i} id={`${id}-${i}`}>
            <circle cx={c.x} cy={c.y} r={RADIUS} />
          </clipPath>
        ))}
      </defs>
      {circles.map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 円は位置で決まり、並べ替わらない
        <circle key={i} cx={c.x} cy={c.y} r={RADIUS} fill={colors[i]} />
      ))}
      {circles.flatMap((_, i) =>
        circles.slice(i + 1).map((b, j) => (
          <circle
            // biome-ignore lint/suspicious/noArrayIndexKey: 円は位置で決まり、並べ替わらない
            key={`${i}-${i + 1 + j}`}
            cx={b.x}
            cy={b.y}
            r={RADIUS}
            fill={overlap}
            clipPath={`url(#${id}-${i})`}
          />
        )),
      )}
    </svg>
  );
}
