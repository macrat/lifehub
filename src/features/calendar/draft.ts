import type { DateString } from '../../../shared/types.ts';
import {
  formatDate,
  formatDateRange,
  formatMinutesOfDay,
  fromDateValue,
  fromMinutesOfDay,
} from '../../lib/date.ts';
import {
  allDayEventValues,
  eventValuesForRange,
  type ItemFormValues,
} from '../events/form-values.ts';
import { MIN_BLOCK_MINUTES } from './components/timeline-layout.ts';

/**
 * グリッドで選んだ、まだ保存していない予定の範囲（Google カレンダーの下書き）。
 * 週・日の時間軸で選べば時間指定、月と終日欄で選べば終日になる。
 */
export type EventDraft =
  | { allDay: false; date: DateString; startMin: number; endMin: number }
  /** from・to はどちらも含む日 */
  | { allDay: true; from: DateString; to: DateString };

/** 時間軸の 1 点（日と、その日の 0:00 からの分） */
export type TimePoint = { date: DateString; min: number };

/** ドラッグの刻み（分）。Google カレンダーと同じ 15 分の枠に吸着させる */
const STEP_MINUTES = 15;
const SLOTS_PER_DAY = (24 * 60) / STEP_MINUTES;
/** タップ・クリック（動かさずに離す）で作る予定の長さ（分）。Google カレンダーと同じ 1 時間 */
const TAP_MINUTES = 60;

/**
 * 時間軸の 2 点 → 下書き。日は始点のもので決まる（列をまたいでも日は変わらない）。
 * ドラッグ（moved）は触れた枠をすべて含め（上向きも同じ）、読めない高さにならないよう最短 MIN_BLOCK_MINUTES を保つ。
 * 動かしていなければ押した枠から 1 時間。
 */
export function timeDraft(anchor: TimePoint, current: TimePoint, moved: boolean): EventDraft {
  const slotAt = (min: number) =>
    Math.min(Math.max(Math.floor(min / STEP_MINUTES), 0), SLOTS_PER_DAY - 1);
  const anchorSlot = slotAt(anchor.min);
  const currentSlot = moved ? slotAt(current.min) : anchorSlot;
  const startMin = Math.min(
    Math.min(anchorSlot, currentSlot) * STEP_MINUTES,
    24 * 60 - MIN_BLOCK_MINUTES,
  );
  const endMin = moved
    ? Math.max((Math.max(anchorSlot, currentSlot) + 1) * STEP_MINUTES, startMin + MIN_BLOCK_MINUTES)
    : Math.min(startMin + TAP_MINUTES, 24 * 60);
  return { allDay: false, date: anchor.date, startMin, endMin };
}

/** 日の 2 点 → 終日の下書き（両端を含む。どちら向きに選んでも同じ） */
export function dayDraft(anchor: DateString, current: DateString): EventDraft {
  const [from, to] = anchor <= current ? [anchor, current] : [current, anchor];
  return { allDay: true, from, to };
}

/**
 * 並んだ日（月の 1 週、タイムラインの日）のうち下書きが占める列。掛からなければ null。
 * roundStart・roundEnd は本当の端がこの並びに入っているか（週をまたぐ帯は続きとして描く）。
 */
export function draftColumns(
  draft: EventDraft,
  days: DateString[],
): { col: number; span: number; roundStart: boolean; roundEnd: boolean } | null {
  if (!draft.allDay) return null;
  const first = days.findIndex((d) => d >= draft.from);
  const last = days.findLastIndex((d) => d <= draft.to);
  if (first === -1 || last === -1 || first > last) return null;
  return {
    col: first,
    span: last - first + 1,
    roundStart: days[first] === draft.from,
    roundEnd: days[last] === draft.to,
  };
}

/** 下書きの期間の表示（クイック入力の見出し） */
export function draftText(draft: EventDraft): string {
  if (draft.allDay) {
    const days =
      draft.from === draft.to ? formatDate(draft.from) : formatDateRange(draft.from, draft.to);
    return `${days} 終日`;
  }
  return `${formatDate(draft.date)} ${formatMinutesOfDay(draft.startMin)}〜${formatMinutesOfDay(draft.endMin)}`;
}

/** 保存するときの日時。終日の終わりは「含む日」で送る（サーバーが翌日 0:00 に直す） */
export function draftInstants(draft: EventDraft): {
  allDay: boolean;
  startsAt: string;
  endsAt: string;
} {
  return draft.allDay
    ? { allDay: true, startsAt: fromDateValue(draft.from), endsAt: fromDateValue(draft.to) }
    : {
        allDay: false,
        startsAt: fromMinutesOfDay(draft.date, draft.startMin),
        endsAt: fromMinutesOfDay(draft.date, draft.endMin),
      };
}

/** 全項目のフォーム（「その他のオプション」）に渡す既定値 */
export function draftValues(draft: EventDraft): ItemFormValues {
  return draft.allDay
    ? allDayEventValues(draft.from, draft.to)
    : eventValuesForRange(draft.date, draft.startMin, draft.endMin);
}
