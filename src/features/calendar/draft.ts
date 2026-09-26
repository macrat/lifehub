import { type CalendarItem, occurrenceKey } from '../../../shared/calendar.ts';
import { DAY_MINUTES } from '../../../shared/constants.ts';
import { allDayDate, type DateRange, minutesOfDay } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import type { ItemEnds } from './item-shape.ts';
import { MIN_BLOCK_MINUTES, timedSlot, timelineSlot } from './timeline-layout.ts';

/**
 * グリッドで選んだ、まだ保存していない予定の範囲（Google カレンダーの下書き）。
 * 週・日の時間軸で選べば時間指定、月と終日欄で選べば終日になる。
 */
export type EventDraft =
  | { allDay: false; date: DateString; startMin: number; endMin: number }
  /** from・to はどちらも含む日 */
  | { allDay: true; from: DateString; to: DateString };

/**
 * グリッドに出している枠。range はその範囲で、item は枠が直している保存済みの予定
 * （長押しでつまんだもの。まだ無い予定を追加するときは null）。
 * ドラッグは範囲と対象を一緒に返すので、つまむたびに「今どれを直しているか」が決まる。
 */
export type Draft = { range: EventDraft; item: CalendarItem | null };

/** 時間指定の下書き（週・日の時間軸に出す枠） */
export type TimedDraft = EventDraft & { allDay: false };

/** 終日の下書き（月表示・終日欄に出す帯） */
export type AllDayDraft = EventDraft & { allDay: true };

/** つまんだ枠が直している予定（追加の下書きなら null）。ドラッグの間も持ち回る */
export type Grabbed = { item: CalendarItem | null };

/**
 * 保存済みの項目 → グリッドの枠。つまんで直せない項目は null。
 * 日ごとに 1 件で返る項目からでも、持っている日時（`startsAt` / `endsAt`）だけで期間が決まる。
 * 予定でつまめないのは、枠に出せない「日をまたぐ時間指定の予定」。
 * タスクは置かれている所（時間軸ならその時刻の最小の長さのブロック、それ以外は置かれた日 1 日）を枠にする。
 * 長さを持たないので、枠は動かすだけで端は直せない（`hasEnds`）。
 * 完了したタスクは完了した日時に置かれていて、開始・期限を動かしても場所が変わらないのでつままない。
 */
export function itemDraft(item: CalendarItem): EventDraft | null {
  let draft = itemDrafts.get(item);
  if (draft === undefined) {
    draft = computeItemDraft(item);
    itemDrafts.set(item, draft);
  }
  return draft;
}

/**
 * 項目ごとの枠の覚え書き。面はつまめる項目ごとに枠を描画のたびに求め、ドラッグ中は指が動くたびに
 * 描き直す（下書きが変わるので面の memo が効かない）。枠は項目だけで決まり、項目はキャッシュの同じ
 * オブジェクトが渡り続けるので、1 項目 1 回で済ませる（時刻の読み取りはタイムゾーンの計算を伴う）。
 * WeakMap なので、キャッシュから外れた項目の分は一緒に消える。
 */
const itemDrafts = new WeakMap<CalendarItem, EventDraft | null>();

function computeItemDraft(item: CalendarItem): EventDraft | null {
  if (item.kind === 'task') {
    if (item.completedAt !== null) return null;
    return taskFrame(item.placementDate, timelineSlot(item)?.startMin ?? null);
  }
  if (item.allDay)
    return {
      allDay: true,
      from: allDayDate(item.startsAt, 'start'),
      to: allDayDate(item.endsAt, 'end'),
    };
  const slot = timedSlot(item);
  return slot && { allDay: false, date: item.placementDate, ...slot };
}

/**
 * タスクの枠。時刻（その日の 0:00 からの分）があれば時間軸に置くブロックと同じ最小の長さ（24 時で切る）、
 * 無ければその日 1 日。置かれているタスクの枠（`itemDraft`）と入力で直した日時の枠（`taskDraftFromInput`）が
 * 同じ形になるよう、ここ 1 か所で決める。
 */
export function taskFrame(date: DateString, startMin: number | null): EventDraft {
  if (startMin === null) return allDayDraft(date);
  return {
    allDay: false,
    date,
    startMin,
    endMin: Math.min(startMin + MIN_BLOCK_MINUTES, DAY_MINUTES),
  };
}

/**
 * 枠の端（開始・終了）をつまんで直せるか。タスクは長さを持たないので、どこをつまんでも枠ごと動く
 * （時間軸は端の丸・線を出さず、日の並びは端に当たる所を押しても帯そのもの）。
 */
export function hasEnds(item: CalendarItem | null): boolean {
  return item?.kind !== 'task';
}

/**
 * 直している対象が同じか。複数日の予定は日ごとに 1 件で返り、月グリッドでは週の行ごとに帯が分かれるので、
 * 暦日ではなく「どの発生か」（`occurrenceKey`）で見る。どちらも無い（追加の下書き）なら同じ。
 */
export function sameOccurrence(
  a: CalendarItem | null | undefined,
  b: CalendarItem | null | undefined,
): boolean {
  if (!a || !b) return !a && !b;
  return occurrenceKey(a) === occurrenceKey(b);
}

/** タップ・クリック（動かさずに離す）で作る予定の長さ（分）。Google カレンダーと同じ 1 時間 */
export const TAP_MINUTES = 60;
/**
 * 吸着したときの手応えの長さ（ms）。長いのは時間軸の正時だけの合図にして、それ以外の区切り
 * （15 分の刻み、日をまたぐとき）は短く軽く返す。これで時間の区切りを見ずに聞き分けられる。
 */
export const LONG_VIBRATION_MS = 50;
export const SHORT_VIBRATION_MS = 10;

/**
 * 終日から時間指定に切り替えたときの下書き。グリッドをタップしたときと同じ「1 時間の枠」を、次の正時に置く。
 * 枠は日をまたげないので、遅い時刻では最後の 1 時間（23:00〜24:00）に収める。
 */
export function nextHourDraft(date: DateString, now: Date = new Date()): TimedDraft {
  const nextHour = Math.ceil(minutesOfDay(now) / 60) * 60;
  const startMin = Math.min(nextHour, DAY_MINUTES - TAP_MINUTES);
  return { allDay: false, date, startMin, endMin: startMin + TAP_MINUTES };
}

/**
 * 終日の切り替え（クイック入力の「終日」）。終日かどうかは下書きだけが持ち、切り替えは下書きそのものを
 * 入れ替える。見出し・グリッドの枠・保存する日時がいつも同じ 1 つの下書きから決まるように。
 * 時間指定 → 終日はその日 1 日。終日 → 時間指定は、最初の日の次の正時から 1 時間（`nextHourDraft`）。
 * 時間指定の枠は日をまたげないので、複数日の終日から戻すと最初の日だけになる。
 */
export function withAllDay(draft: EventDraft, allDay: boolean, now: Date = new Date()): EventDraft {
  if (draft.allDay === allDay) return draft;
  return draft.allDay ? nextHourDraft(draft.from, now) : allDayDraft(draft.date);
}

/** その日 1 日の終日の下書き */
export function allDayDraft(date: DateString): AllDayDraft {
  return { allDay: true, from: date, to: date };
}

/** 日の並びで下書きが占める期間（両端を含む）。時間指定の下書きはその日 1 日ぶん */
export function draftDays(draft: EventDraft): DateRange {
  return draft.allDay ? draft : { from: draft.date, to: draft.date };
}

/**
 * 並んだ日（月の 1 週、タイムラインの日）のうち下書きが占める列。掛からなければ null。
 * roundStart・roundEnd は本当の端がこの並びに入っているか（週をまたぐ帯は続きとして描く）。
 */
export function draftColumns(
  draft: EventDraft,
  days: DateString[],
): ({ col: number; span: number } & ItemEnds) | null {
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
