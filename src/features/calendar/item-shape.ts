import { smoothCornersMask } from '../../lib/ui/squircle.ts';

/**
 * 帯の両端が本当の端か。週をまたぐ帯は週ごとに 1 本ずつ描き、前後の週へ続く側は false。
 * 本当の端だけ角を丸めて余白を空け、続きの端は角を立ててセルの端まで伸ばし、隣の週の帯とつながって見せる。
 */
export type ItemEnds = { roundStart: boolean; roundEnd: boolean };

/**
 * カレンダーの項目（月・終日欄の帯、時間軸のブロック、下書きの枠）の角の大きさ（px）。
 * 超楕円は角の奥から緩やかに曲がり始めるので、円弧の角丸（border-radius）と同じくらいの丸さに見せるには
 * 円弧の半径の 2 倍ほどの大きさが要る。8px で border-radius の 4px とおおよそ同じ丸さになる。
 */
const ITEM_CORNER = 8;

/**
 * カレンダーの項目の形を切り抜く CSS の `mask`（`smoothCornersMask`。ホームのタイルと同じ形の系統）。
 * 続きの端は角を丸めない。`line` を与えると枠の線の形になる。
 */
export function itemMask(ends?: ItemEnds, line?: number): string {
  return smoothCornersMask(ITEM_CORNER, { ...ends, line });
}

/** 帯の左右の余白。本当の端は 2px 空けて隣の日の項目と離し、続きの端はセルの端まで伸ばす */
export function itemMargins({ roundStart, roundEnd }: ItemEnds) {
  return { ml: roundStart ? '2px' : 0, mr: roundEnd ? '2px' : 0 };
}
