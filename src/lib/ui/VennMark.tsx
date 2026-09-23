import { useId } from 'react';
import { pointAt, WedgeFill, wedgeAngles } from './WedgeFill.tsx';

/** 1 つの円の半径 */
const RADIUS = 5.5;

/** 隣り合う円の中心の間隔。半径と同じにして、重なった輪郭がくびれとして見え、何人かが分かるようにする */
const GAP = 5.5;

/** 描く枠の一辺。4 つ（四角）まで並べても収まる */
const SIZE = 20;

/**
 * ベン図の形をした印（予定の参加者、立替の To と From）。色の数だけ円を `wedgeAngles` の向きに重ね、
 * 円すべてを合わせた形で `WedgeFill` を切り抜く。重なった領域も、最も近い円の色になる。
 *
 * WHY 重なりも誰かの色で塗る: 小さな印なので、色の面積をできるだけ広く取ったほうが誰の色かを
 * 見分けやすい。重なりを別の色（無彩色や背景色）にすると、3 人・4 人のときに色が細い欠片になる。
 * WHY 円を重ねる: 円を並べるだけだと横に長くなって行の印の枠に収まらず、扇形に割った 1 つの円だと
 * 1 人のときの丸と見分けにくい。重ねると小さくまとまったまま、何人かが輪郭で分かる。
 * `size` は描く大きさ（px）。形は変えずに縮めるので、月表示の点のような小さな印にも使える。
 */
export function VennMark({ colors, size = SIZE }: { colors: string[]; size?: number }) {
  const id = useId();
  const count = colors.length;
  // 1 つのときは中心に置く
  const distance = count === 1 ? 0 : GAP / (2 * Math.sin(Math.PI / count));
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`}
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <clipPath id={id}>
        {wedgeAngles(count).map((angle, i) => {
          const c = pointAt(angle, distance);
          // biome-ignore lint/suspicious/noArrayIndexKey: 円は位置で決まり、並べ替わらない
          return <circle key={i} cx={c.x} cy={c.y} r={RADIUS} />;
        })}
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <WedgeFill colors={colors} reach={SIZE} />
      </g>
    </svg>
  );
}
