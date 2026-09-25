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
 * 帯やブロックでは sx ではなく style で渡す。mask は 2KB ほどの文字列で、項目ごとに別の規則になる sx に入れると
 * 項目の数だけ同じ文字列が CSS に複製される。
 */
export function itemMask(options?: SmoothCornersOptions): string {
  return smoothCornersMask(ITEM_CORNER, options);
}
