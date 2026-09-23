import { useId } from 'react';
import { pointAt, wedgeAngles, wedgePoints } from './wedges.ts';

/** 1 つの円の半径 */
const RADIUS = 5.5;

/** 隣り合う円の中心の間隔。半径と同じにして、重なった輪郭がくびれとして見え、何人かが分かるようにする */
const GAP = 5.5;

/** 描く枠の一辺。4 つ（四角）まで並べても収まる */
const SIZE = 20;

/**
 * ベン図の形をした印（予定の参加者、立替の To と From）。円ごとに `colors` の色で塗る。
 * 円は中心の周りに等間隔に並べ（`wedgeAngles`）、重なった領域も中心で扇形に分けて
 * それぞれの円の色で塗る（`wedgePoints`。境目が隣り合う円の中心の垂直二等分線になる）。
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
      {wedgeAngles(count).map((angle, i) => {
        const c = pointAt(angle, distance);
        const clipId = `${id}-${i}`;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: 円は位置で決まり、並べ替わらない
          <g key={i}>
            {count > 1 && (
              <clipPath id={clipId}>
                <polygon points={wedgePoints(angle, count, SIZE)} />
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
