import type { DateRange } from '../../../shared/calendar.ts';
import { addDays, diffDays, toDateString } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import {
  formatDate,
  formatMinutesOfDay,
  fromDateValue,
  fromMinutesOfDay,
  minutesOfDay,
} from '../../lib/date.ts';
import {
  allDayEventValues,
  eventValuesForRange,
  type ItemFormValues,
} from '../events/form-values.ts';
import { MIN_BLOCK_MINUTES } from './components/timeline-layout.ts';
import type { Drag } from './use-range-drag.ts';

/**
 * グリッドで選んだ、まだ保存していない予定の範囲（Google カレンダーの下書き）。
 * 週・日の時間軸で選べば時間指定、月と終日欄で選べば終日になる。
 */
export type EventDraft =
  | { allDay: false; date: DateString; startMin: number; endMin: number }
  /** from・to はどちらも含む日 */
  | { allDay: true; from: DateString; to: DateString };

/** 時間指定の下書き（週・日の時間軸に出す枠） */
export type TimedDraft = EventDraft & { allDay: false };

/** 終日の下書き（月表示・終日欄に出す帯） */
export type AllDayDraft = EventDraft & { allDay: true };

/** 時間軸の 1 点（日と、その日の 0:00 からの分） */
export type TimePoint = { date: DateString; min: number };

/**
 * 下書きをつまんだ所。start・end はその端だけを動かし、move は長さ（時間指定なら時間、終日なら日数）を
 * 保ったまま動かす。つままずに空いている所を押したときは掴んだ物が無い（`Drag.grab` が null）ので、
 * 押した所から選び直す。
 */
export type TimeGrab = { kind: 'start' | 'end' | 'move'; draft: TimedDraft };
/** 日の並びでは時間指定の下書きは幅が 1 日で、動かせるのは日だけ（時間帯は時間軸で直す） */
export type DayGrab =
  | { kind: 'start' | 'end'; draft: AllDayDraft }
  | { kind: 'move'; draft: EventDraft };

/** ドラッグの刻み（分）。Google カレンダーと同じ 15 分の枠に吸着させる */
const STEP_MINUTES = 15;
const SLOTS_PER_DAY = (24 * 60) / STEP_MINUTES;
const DAY_MINUTES = 24 * 60;
/** タップ・クリック（動かさずに離す）で作る予定の長さ（分）。Google カレンダーと同じ 1 時間 */
const TAP_MINUTES = 60;
/**
 * 吸着したときの手応えの長さ（ms）。長いのは時間軸の正時だけの合図にして、それ以外の区切り
 * （15 分の刻み、日をまたぐとき）は短く軽く返す。これで時間の区切りを見ずに聞き分けられる。
 */
const LONG_VIBRATION_MS = 50;
const SHORT_VIBRATION_MS = 10;

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

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
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
    : Math.min(startMin + TAP_MINUTES, DAY_MINUTES);
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

/**
 * 追加ボタンから置く下書き。グリッドをタップしたときと同じ「1 時間の枠」を、次の正時に置く。
 * 枠は日をまたげないので、遅い時刻では最後の 1 時間（23:00〜24:00）に収める。
 */
export function defaultDraft(date: DateString, now: Date = new Date()): TimedDraft {
  const nextHour = Math.ceil(minutesOfDay(now) / 60) * 60;
  const startMin = Math.min(nextHour, 24 * 60 - TAP_MINUTES);
  return { allDay: false, date, startMin, endMin: startMin + TAP_MINUTES };
}

/**
 * 日の並びで押した所が、今出ている下書きのどこか。掛かっていなければ null（押した所から選び直す）。
 * 終日は、最初の日の左半分・最後の日の右半分ならその端、それ以外の中ほどなら帯そのもの
 * （1 日だけの下書きには中ほどが無く、左右の半分がそのまま開始・終了になる）。
 * 時間指定は 1 日ぶんの帯で、日の並びでは時間帯を変えられないので帯そのものだけ。
 * 見るのは帯そのものではなく日のセルの左右。帯は指より薄く（月グリッドで 17px）狙って押せないうえ、
 * 帯は見せるだけでポインタを受けるのは下のセルだから（`DraftBar`）。
 */
export function dayGrab(
  draft: EventDraft | null,
  date: DateString,
  half: 'left' | 'right',
): DayGrab | null {
  if (draft === null) return null;
  const { from, to } = draftDays(draft);
  if (date < from || date > to) return null;
  // 時間指定の帯は 1 日ぶんで、日の並びでは時間帯を変えられない。動かせるのは日だけ
  if (!draft.allDay) return { kind: 'move', draft };
  if (date === from && half === 'left') return { kind: 'start', draft };
  if (date === to && half === 'right') return { kind: 'end', draft };
  return { kind: 'move', draft };
}

/**
 * 日の並び（月表示・終日欄）のドラッグ → 下書き。
 * 空いている所からは押した日と今の日を両端にする終日の下書き（両端を含み、どちら向きに選んでも同じ）。
 * つまんだだけで動かしていなければそのまま。端をつまんだときは反対の端を越えられない（最短 1 日）。
 * 帯そのものをつまんだときは動かした日数だけずらす。終日は日数を、時間指定は時間帯を保つ。
 */
export function dayDraft({ grab, from, to, moved }: Drag<DateString, DayGrab>): EventDraft {
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
export function dayVibration(previous: EventDraft, draft: EventDraft): number | null {
  const days = draftDays(draft);
  const previousDays = draftDays(previous);
  return days.from === previousDays.from && days.to === previousDays.to ? null : SHORT_VIBRATION_MS;
}

/** 日の並びで下書きが占める期間（両端を含む）。時間指定の下書きはその日 1 日ぶん */
function draftDays(draft: EventDraft): DateRange {
  return draft.allDay ? draft : { from: draft.date, to: draft.date };
}

/** 下書きが始まる日（複数日にわたる終日の下書きなら最初の日） */
export function draftFirstDay(draft: EventDraft): DateString {
  return draftDays(draft).from;
}

/**
 * 並んだ日（月の 1 週、タイムラインの日）のうち下書きが占める列。掛からなければ null。
 * roundStart・roundEnd は本当の端がこの並びに入っているか（週をまたぐ帯は続きとして描く）。
 */
export function draftColumns(
  draft: EventDraft,
  days: DateString[],
): { col: number; span: number; roundStart: boolean; roundEnd: boolean } | null {
  const { from, to } = draftDays(draft);
  const first = days.findIndex((d) => d >= from);
  const last = days.findLastIndex((d) => d <= to);
  if (first === -1 || last === -1 || first > last) return null;
  return {
    col: first,
    span: last - first + 1,
    roundStart: days[first] === from,
    roundEnd: days[last] === to,
  };
}

/** 下書きの期間の表示（クイック入力の見出し） */
export function draftText(draft: EventDraft): string {
  if (draft.allDay) {
    const days =
      draft.from === draft.to
        ? formatDate(draft.from)
        : `${formatDate(draft.from)}〜${formatDate(draft.to)}`;
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
export function draftValues(draft: EventDraft, participantIds: string[]): ItemFormValues {
  return draft.allDay
    ? allDayEventValues(draft.from, draft.to, participantIds)
    : eventValuesForRange(draft.date, draft.startMin, draft.endMin, participantIds);
}

/**
 * 保存する形の日時 → 下書き（グリッドの枠）。フォームで直した日時を枠に映し戻すのに使う。
 * 枠に出せない範囲（日をまたぐ時間指定、終わりが始まりより前）は null で、枠はそのままにする。
 */
export function draftFromInstants(
  allDay: boolean,
  startsAt: string,
  endsAt: string,
): EventDraft | null {
  const from = toDateString(new Date(startsAt));
  if (allDay) {
    // 終日の入力の終わりは「含む終了日」
    const to = toDateString(new Date(endsAt));
    return to >= from ? { allDay: true, from, to } : null;
  }
  if (toDateString(new Date(endsAt)) !== from) return null;
  const startMin = minutesOfDay(startsAt);
  const endMin = minutesOfDay(endsAt);
  return endMin > startMin ? { allDay: false, date: from, startMin, endMin } : null;
}
