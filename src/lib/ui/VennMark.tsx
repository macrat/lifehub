import { useId } from 'react';

/** 1 つの円の半径 */
const RADIUS = 5.5;

/** 隣り合う円の中心の間隔。半径と同じにして、重なった輪郭がくびれとして見え、何人かが分かるようにする */
const GAP = 5.5;

/** 描く枠の一辺。4 つ（四角）まで並べても収まる */
const SIZE = 20;

/**
 * 円を正多角形の頂点に置く。2 つは左右、3 つは上に 1 つ足した三角、4 つは四角になる。
 * 始めの角度を 90° + 180°/n にすると、どの数でも底辺が水平になる（y は下向き）。
 */
function angles(count: number): number[] {
  const start = Math.PI / 2 + Math.PI / count;
  return Array.from({ length: count }, (_, i) => start + (2 * Math.PI * i) / count);
}

/** 中心から角度 angle の向きに distance 離れた点 */
function at(angle: number, distance: number): { x: number; y: number } {
  return { x: distance * Math.cos(angle), y: distance * Math.sin(angle) };
}

/**
 * 円 1 つが受け持つ扇形（中心から、隣の円との間の角度まで）。枠より大きく取り、円で切り抜いて使う。
 * 円は中心の周りに等間隔に並ぶので、扇形の境目は隣り合う円の中心の垂直二等分線になる。
 * 2 つなら縦の線、3 つなら Y の字、4 つなら十字で分かれる。
 */
function wedge(angle: number, count: number): string {
  const half = Math.PI / count;
  return [{ x: 0, y: 0 }, at(angle - half, SIZE), at(angle, SIZE), at(angle + half, SIZE)]
    .map((p) => `${p.x},${p.y}`)
    .join(' ');
}

/**
 * ベン図の形をした印（予定の参加者、立替の To と From）。円ごとに `colors` の色で塗る。
 * 円どうしが重なった領域も、中心で扇形に分けてそれぞれの円の色で塗る（`wedge`）。
 *
 * WHY 重なりも誰かの色で塗る: 小さな印なので、色の面積をできるだけ広く取ったほうが誰の色かを
 * 見分けやすい。重なりを別の色（無彩色や背景色）にすると、3 人・4 人のときに色が細い欠片になる。
 * WHY 円を重ねる: 円を並べるだけだと横に長くなって行の印の枠に収まらず、扇形に割った 1 つの円だと
 * 1 人のときの丸と見分けにくい。重ねると小さくまとまったまま、何人かが輪郭で分かる。
 */
export function VennMark({ colors }: { colors: string[] }) {
  const id = useId();
  const count = colors.length;
  // 1 つのときは中心に置き、切り分けない
  const distance = count === 1 ? 0 : GAP / (2 * Math.sin(Math.PI / count));
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`}
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      {angles(count).map((angle, i) => {
        const c = at(angle, distance);
        const clipId = `${id}-${i}`;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: 円は位置で決まり、並べ替わらない
          <g key={i}>
            {count > 1 && (
              <clipPath id={clipId}>
                <polygon points={wedge(angle, count)} />
              </clipPath>
            )}
            <circle
              cx={c.x}
              cy={c.y}
              r={RADIUS}
              fill={colors[i]}
              clipPath={count > 1 ? `url(#${clipId})` : undefined}
            />
          </g>
        );
      })}
    </svg>
  );
}
