import { DAY_MINUTES } from '../../../shared/constants.ts';
import type { DateString } from '../../../shared/types.ts';
import { clamp } from '../../lib/math.ts';
import {
  type Grabbed,
  LONG_VIBRATION_MS,
  SHORT_VIBRATION_MS,
  type TimedDraft,
  tapEnd,
} from './draft.ts';
import type { Drag } from './range-drag-session.ts';
import { MIN_BLOCK_MINUTES } from './timeline-layout.ts';

/** 週・日の時間軸のドラッグ → 下書き（15 分の刻みへの吸着と手応え）。下書きの形は `draft.ts` */

/** 時間軸の 1 点（日と、その日の 0:00 からの分） */
export type TimePoint = { date: DateString; min: number };

/**
 * 下書きをつまんだ所。start・end はその端だけを動かし、move は長さ（時間指定なら時間、終日なら日数）を
 * 保ったまま動かす。つままずに空いている所を押したときは掴んだ物が無い（`Drag.grab` が null）ので、
 * 押した所から選び直す。
 */
export type TimeGrab = Grabbed & { kind: 'start' | 'end' | 'move'; draft: TimedDraft };
/** ドラッグの刻み（分）。Google カレンダーと同じ 15 分の枠に吸着させる */
const STEP_MINUTES = 15;
const SLOTS_PER_DAY = DAY_MINUTES / STEP_MINUTES;

/**
 * 時間軸のドラッグ → 下書き。日は始点のもので決まる（列をまたいでも日は変わらない）。
 * 空いている所からのドラッグ（grab が null）は触れた枠をすべて含め（上向きも同じ）、
 * 読めない高さにならないよう最短 MIN_BLOCK_MINUTES を保つ。動かしていなければ押した枠から 1 時間。
 * 下書きをつまんだときは、動かした分だけをその枠に反映する（つまんだだけで動かしていなければそのまま）。
 * 端をつまんだときは反対の端を越えられない（最短 STEP_MINUTES を残す）。日は変わらない。
 * 枠そのものをつまんだときは長さを保ち、0:00〜24:00 の中に収める。こちらは指の下の列の日に移るので、
 * 週表示では左右に動かして別の日へ持っていける（日表示は列が 1 つなので日が変わらない）。
 */
export function timeDraft({ grab, from, to, moved }: Drag<TimePoint, TimeGrab>): TimedDraft {
  if (grab === null) return selectDraft(from, to, moved);
  // つまんだだけ（動かしていない）なら触らない。押した所に枠が飛ばないようにする
  if (!moved) return grab.draft;
  const { startMin, endMin } = grab.draft;
  switch (grab.kind) {
    case 'start':
      return { ...grab.draft, startMin: Math.min(snap(to.min), endMin - STEP_MINUTES) };
    case 'end':
      return { ...grab.draft, endMin: Math.max(snap(to.min), startMin + STEP_MINUTES) };
    case 'move': {
      const length = endMin - startMin;
      const start = clamp(snap(startMin + (to.min - from.min)), 0, DAY_MINUTES - length);
      return { ...grab.draft, date: to.date, startMin: start, endMin: start + length };
    }
  }
}

/** 一番近い 15 分の枠に寄せる（つまんだ所からずれないよう、切り捨てではなく四捨五入） */
const snap = (min: number) => clamp(Math.round(min / STEP_MINUTES) * STEP_MINUTES, 0, DAY_MINUTES);

/** 空いている所をなぞって選ぶ範囲。触れた 15 分の枠をすべて含める */
function selectDraft(from: TimePoint, to: TimePoint, moved: boolean): TimedDraft {
  const slotAt = (min: number) => clamp(Math.floor(min / STEP_MINUTES), 0, SLOTS_PER_DAY - 1);
  const fromSlot = slotAt(from.min);
  const toSlot = moved ? slotAt(to.min) : fromSlot;
  const startMin = Math.min(
    Math.min(fromSlot, toSlot) * STEP_MINUTES,
    DAY_MINUTES - MIN_BLOCK_MINUTES,
  );
  const endMin = moved
    ? Math.max((Math.max(fromSlot, toSlot) + 1) * STEP_MINUTES, startMin + MIN_BLOCK_MINUTES)
    : tapEnd(startMin);
  return { allDay: false, date: from.date, startMin, endMin };
}

/**
 * 時間指定の下書きが動いたときの手応えの長さ（ms）。動いていなければ null。
 * 15 分の枠に吸着するたびに震わせ、正時だけ短くして時間の区切りが指で分かるようにする。
 * 見るのは開始 → 終了の順で、枠ごと動かして両方が動くときは開始時刻が基準になる。
 */
export function timeVibration(previous: TimedDraft, draft: TimedDraft): number | null {
  if (draft.startMin !== previous.startMin) return vibrationFor(draft.startMin);
  if (draft.endMin !== previous.endMin) return vibrationFor(draft.endMin);
  return null;
}

const vibrationFor = (min: number) => (min % 60 === 0 ? LONG_VIBRATION_MS : SHORT_VIBRATION_MS);
