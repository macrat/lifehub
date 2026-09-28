import { inRange } from '../../../shared/calendar.ts';
import { addDays, diffDays } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import {
  type AllDayDraft,
  type Draft,
  type DraftRange,
  draftDays,
  type Grabbed,
  hasEnds,
  SHORT_VIBRATION_MS,
} from './draft.ts';
import type { Drag } from './range-drag-session.ts';

/** 日の並び（月表示・終日欄）のドラッグ → 下書き（押した所の判定と手応え）。下書きの形は `draft.ts` */

/** 日の並びでは時間指定の下書きは幅が 1 日で、動かせるのは日だけ（時間帯は時間軸で直す） */
export type DayGrab = Grabbed &
  ({ kind: 'start' | 'end'; draft: AllDayDraft } | { kind: 'move'; draft: DraftRange });

/**
 * 日の並びで押した所が、今出ている枠（下書き・編集中の予定）のどこか。掛かっていなければ null（押した所から選び直す）。
 * 終日は、最初の日の左半分・最後の日の右半分ならその端、それ以外の中ほどなら帯そのもの
 * （1 日だけの下書きには中ほどが無く、左右の半分がそのまま開始・終了になる）。
 * 時間指定は 1 日ぶんの帯で、日の並びでは時間帯を変えられないので帯そのものだけ。
 * タスクは長さを持たないので、どこを押しても帯そのもの。
 * 見るのは帯そのものではなく日のセルの左右。帯は指より薄く（月グリッドで 17px）狙って押せないうえ、
 * 帯は見せるだけでポインタを受けるのは下のセルだから（`DraftBar`）。
 */
export function dayGrab(
  draft: Draft | null,
  date: DateString,
  half: 'left' | 'right',
): DayGrab | null {
  if (draft === null) return null;
  const { range, item } = draft;
  const days = draftDays(range);
  if (!inRange(date, days)) return null;
  const { from, to } = days;
  // 時間指定の帯は 1 日ぶんで、日の並びでは時間帯を変えられない。端の無い枠（タスク）も動かすだけ
  if (!range.allDay || !hasEnds(item)) return { kind: 'move', draft: range, item };
  if (date === from && half === 'left') return { kind: 'start', draft: range, item };
  if (date === to && half === 'right') return { kind: 'end', draft: range, item };
  return { kind: 'move', draft: range, item };
}

/**
 * 日の並び（月表示・終日欄）のドラッグ → 下書き。
 * 空いている所からは押した日と今の日を両端にする終日の下書き（両端を含み、どちら向きに選んでも同じ）。
 * つまんだだけで動かしていなければそのまま。端をつまんだときは反対の端を越えられない（最短 1 日）。
 * 帯そのものをつまんだときは動かした日数だけずらす。終日は日数を、時間指定は時間帯を保つ。
 */
export function dayDraft({ grab, from, to, moved }: Drag<DateString, DayGrab>): DraftRange {
  if (grab === null) return { allDay: true, from: earlier(from, to), to: later(from, to) };
  if (!moved) return grab.draft;
  switch (grab.kind) {
    case 'start':
      return { ...grab.draft, from: earlier(to, grab.draft.to) };
    case 'end':
      return { ...grab.draft, to: later(to, grab.draft.from) };
    case 'move': {
      const { draft } = grab;
      const shift = diffDays(from, to);
      return draft.allDay
        ? { ...draft, from: addDays(draft.from, shift), to: addDays(draft.to, shift) }
        : { ...draft, date: addDays(draft.date, shift) };
    }
  }
}

const earlier = (a: DateString, b: DateString) => (a <= b ? a : b);
const later = (a: DateString, b: DateString) => (a >= b ? a : b);

/**
 * 日の並びで下書きが動いたときの手応えの長さ（ms）。動いていなければ null。
 * 日をまたいで占める日が変わるたびに震わせ、いくつ先の日まで選んだ・動かしたかを数えられるようにする。
 */
export function dayVibration(previous: DraftRange, draft: DraftRange): number | null {
  const days = draftDays(draft);
  const previousDays = draftDays(previous);
  return days.from === previousDays.from && days.to === previousDays.to ? null : SHORT_VIBRATION_MS;
}
