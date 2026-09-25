import { type SmoothCornersOptions, smoothCornersMask } from '../../lib/ui/squircle.ts';

/**
 * カレンダーの項目（月・終日欄の帯、時間軸のブロック、下書きの枠）の角の大きさ（px）。
 * 超楕円は角の奥から緩やかに曲がり始めるので、円弧の角丸（border-radius）と同じくらいの丸さに見せるには
 * 円弧の半径の 2 倍ほどの大きさが要る。8px で border-radius の 4px とおおよそ同じ丸さになる。
 */
const ITEM_CORNER = 8;

/**
 * カレンダーの項目の形を切り抜く CSS の `mask`（`smoothCornersMask`。ホームのタイルと同じ形の系統）。
 * 週をまたぐ帯は、前後の週へ続く側（`roundStart` / `roundEnd` が false）の角を丸めず、隣の週の帯とつながって見せる。
 * sx ではなく style で渡す（疑似要素に掛けるときは CSS 変数で）。mask は 2KB ほどの文字列で、
 * 項目ごと・ドラッグの 1 コマごとに別の規則になる sx に入れると、その数だけ同じ文字列が CSS に複製され、
 * 描き直すたびに直列化・ハッシュし直される。
 */
export function itemMask(options?: SmoothCornersOptions): string {
  return smoothCornersMask(ITEM_CORNER, options);
}

/**
 * 帯の左右の余白（`itemMask` と対）。本当の端は 2px 空けて隣の日の項目と離し、
 * 続きの端（前後の週へ続く側）はセルの端まで伸ばして、隣の週の帯とつながって見せる。
 */
export function itemMargins({ roundStart, roundEnd }: { roundStart: boolean; roundEnd: boolean }) {
  return { ml: roundStart ? '2px' : 0, mr: roundEnd ? '2px' : 0 };
}
