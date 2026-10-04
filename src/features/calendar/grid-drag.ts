import type { CalendarItem } from '../../../shared/calendar.ts';

/**
 * グリッドのドラッグ（時間軸の `time-draft.ts`・日の並びの `day-draft.ts`）に共通の、つまんだ物と手応え。
 * 汎用のドラッグ（`range-drag-session.ts`）は何をつまんだか・何が区切りかを知らないので、意味はここで決める。
 */

/** つまんだ枠が直している予定（追加の下書きなら null）。ドラッグの間も持ち回る */
export type Grabbed = { item: CalendarItem | null };

/**
 * 吸着したときの手応えの長さ（ms）。長いのは時間軸の正時だけの合図にして、それ以外の区切り
 * （15 分の刻み、日をまたぐとき）は短く軽く返す。これで時間の区切りを見ずに聞き分けられる。
 */
export const LONG_VIBRATION_MS = 50;
export const SHORT_VIBRATION_MS = 10;
