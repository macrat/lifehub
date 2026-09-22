import { toDateString } from '../../../shared/date.ts';
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

/** 時間軸の 1 点（日と、その日の 0:00 からの分） */
export type TimePoint = { date: DateString; min: number };

/**
 * 時間軸で下書きをつまんだ所。start・end はその端だけを動かし、move は長さを保ったまま動かす。
 * つままずに空いている所を押したときは掴んだ物が無い（`Drag.grab` が null）ので、押した所から選び直す。
 */
export type TimeGrab = { kind: 'start' | 'end' | 'move'; draft: TimedDraft };

/** ドラッグの刻み（分）。Google カレンダーと同じ 15 分の枠に吸着させる */
const STEP_MINUTES = 15;
const SLOTS_PER_DAY = (24 * 60) / STEP_MINUTES;
const DAY_MINUTES = 24 * 60;
/** タップ・クリック（動かさずに離す）で作る予定の長さ（分）。Google カレンダーと同じ 1 時間 */
const TAP_MINUTES = 60;
/** 吸着したときの手応えの長さ（ms）。正時だけ短くして、時間の区切りを手で見分けられるようにする */
const HOUR_VIBRATION_MS = 10;
const STEP_VIBRATION_MS = 50;

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
 * 下書きが動いたときの手応えの長さ（ms）。動いていなければ null。
 * 15 分の枠に吸着するたびに震わせ、正時だけ短くして時間の区切りが指で分かるようにする。
 * 見るのは開始 → 終了の順で、枠ごと動かして両方が動くときは開始時刻が基準になる。
 */
export function snapVibration(previous: TimedDraft, draft: TimedDraft): number | null {
  if (draft.startMin !== previous.startMin) return vibrationFor(draft.startMin);
  if (draft.endMin !== previous.endMin) return vibrationFor(draft.endMin);
  return null;
}

const vibrationFor = (min: number) => (min % 60 === 0 ? HOUR_VIBRATION_MS : STEP_VIBRATION_MS);

/**
 * 追加ボタンから置く下書き。グリッドをタップしたときと同じ「1 時間の枠」を、次の正時に置く。
 * 枠は日をまたげないので、遅い時刻では最後の 1 時間（23:00〜24:00）に収める。
 */
export function defaultDraft(date: DateString, now: Date = new Date()): EventDraft {
  const nextHour = Math.ceil(minutesOfDay(now) / 60) * 60;
  const startMin = Math.min(nextHour, 24 * 60 - TAP_MINUTES);
  return { allDay: false, date, startMin, endMin: startMin + TAP_MINUTES };
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
export function draftValues(draft: EventDraft): ItemFormValues {
  return draft.allDay
    ? allDayEventValues(draft.from, draft.to)
    : eventValuesForRange(draft.date, draft.startMin, draft.endMin);
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
