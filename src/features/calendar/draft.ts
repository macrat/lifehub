import {
  type CalendarItem,
  DEFAULT_EVENT_MINUTES,
  occurrenceKey,
} from '../../../shared/calendar.ts';
import { DAY_MINUTES } from '../../../shared/constants.ts';
import { allDayDate, type DateRange, minutesOfDay } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import type { EventKind } from '../../../shared/validation/events.ts';
import type { ItemFormValues } from '../events/form-values.ts';
import type { ItemEnds } from './item-shape.ts';
import type { TaskTimes } from './task-draft.ts';
import { taskBlock, timedSlot, timelineSlot } from './timeline-layout.ts';

/**
 * グリッドで選んだ、まだ保存していない予定の範囲（Google カレンダーの下書き）。
 * 週・日の時間軸で選べば時間指定、月と終日欄で選べば終日になる。
 */
export type DraftRange =
  | { allDay: false; date: DateString; startMin: number; endMin: number }
  /** from・to はどちらも含む日 */
  | { allDay: true; from: DateString; to: DateString };

/**
 * グリッドに出している枠。range はその範囲で、item は枠が直している保存済みの予定
 * （長押しでつまんだもの。まだ無い予定を追加するときは null）。
 * ドラッグは範囲と対象を一緒に返すので、つまむたびに「今どれを直しているか」が決まる。
 */
export type Draft = { range: DraftRange; item: CalendarItem | null };

/**
 * グリッドに出している下書き（`Draft`）と、それを入力するクイック入力の状態（`use-event-composer.ts` が持つ）。
 * 追加しようとしている予定・タスクと、長押しでつまんで直している予定・タスク（item）の両方。
 */
export type GridDraft = Draft & {
  /**
   * タスクとして入力しているときの、枠を動かす元になる日時（`TaskTimes`）。予定なら null。
   * 何の枠か（`draftKind`）はこれだけで決まる（種類を別に持つと、種類と日時が食い違いうる）。
   * 直している物（item）の種類とは限らない（クイック入力の上端で切り替えられる）。
   * 予定の日時は枠（range）そのものが持つ。
   */
  task: TaskTimes | null;
  /** 選んでいる参加者。枠の色もこれで決まるので、入力（クイック入力）とグリッドで同じ物を見る */
  participantIds: string[];
  /**
   * なぞり終えたか。なぞっている間は PC の吹き出しを出さず（枠に重なって選べなくなる）、
   * グリッドも枠を追いかけてスクロールしない（指の下でグリッドが動くと狙いがずれる）
   */
  settled: boolean;
  /**
   * 入力をどこから始めたか（グリッドをなぞった・追加ボタン）。開く段とタイトルに焦点を当てるかがこれで決まる。
   * 見た目の結果（段）ではなく入口を持つのは、段と焦点がどちらも入口から決まる別々の事柄だから
   */
  origin: 'grid' | 'add';
};

/**
 * 入力で直した日時の下書きへの映し戻し。予定は枠、タスクは枠を動かす元の日時（`TaskTimes`。開始の所の枠
 * `frame` ごと）。直している物（item）は変わらない
 */
export type DraftChange = { range: DraftRange } | { task: TaskTimes };

/** 入力欄の日時（検証前。`itemInputFromForm` の日時の部分）。終日の終わりは含む日 */
export type WhenInput = { allDay: boolean; startsAt: string | null; endsAt: string | null };

/**
 * 下書きの種類ごとの扱い（予定は `eventDraftOps`、タスクは `taskDraftOps`）。クイック入力（`useQuickForm`）は
 * 種類で分岐せず、下書きに合ったこれを使う。
 * WHY 種類ごとにまとめる: 予定とタスクで違うのは日時の持ち方（予定は枠そのもの、タスクは枠を動かす元の日時）
 * だけで、その違いがここに閉じていれば、入れ物もフックも 1 つのまま種類を切り替えられる。
 */
export type DraftOps = {
  /** 入力の既定値（日時と、直している物から持ち越す残りの項目。参加者は呼び出し側が重ねる） */
  values: ItemFormValues;
  /** 下の段（PC は吹き出し）に出す日時の見出し */
  rangeText: string;
  /** 入力欄で直した日時 → 下書きへの映し戻し。枠に置けない（範囲に出せない・開始が空）なら null */
  fromInput: (input: WhenInput) => DraftChange | null;
  /** 終日の切り替え。入力欄で直していた日時（読めなければ null）を保ったまま切り替える */
  withAllDay: (input: WhenInput | null, allDay: boolean) => DraftChange;
};

/** 下書きが何の枠か。タスクの枠は長さを持たず、端をつまめない（`hasEnds`） */
export function draftKind(draft: Pick<GridDraft, 'task'>): EventKind {
  return draft.task ? 'task' : 'event';
}

/** 同じ範囲か（枠が動いたか）。ドラッグは動くたびに新しい範囲を返すので、値で比べる */
export function sameRange(a: DraftRange, b: DraftRange): boolean {
  if (a.allDay || b.allDay) return a.allDay && b.allDay && a.from === b.from && a.to === b.to;
  return a.date === b.date && a.startMin === b.startMin && a.endMin === b.endMin;
}

/** 時間指定の下書き（週・日の時間軸に出す枠） */
export type TimedDraft = DraftRange & { allDay: false };

/** 終日の下書き（月表示・終日欄に出す帯） */
export type AllDayDraft = DraftRange & { allDay: true };

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
export function itemDraft(item: CalendarItem): DraftRange | null {
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
const itemDrafts = new WeakMap<CalendarItem, DraftRange | null>();

function computeItemDraft(item: CalendarItem): DraftRange | null {
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
 * タスクの枠。時刻（その日の 0:00 からの分）があれば時間軸に置くブロック（`taskBlock`）、
 * 無ければその日 1 日。置かれているタスクの枠（`itemDraft`）と入力で直した日時の枠（`taskDraftFromInput`）が
 * 同じ形になるよう、ここ 1 か所で決める。
 */
export function taskFrame(date: DateString, startMin: number | null): DraftRange {
  if (startMin === null) return allDayDraft(date);
  return { allDay: false, date, ...taskBlock(startMin) };
}

/**
 * 枠をタスクの形にする: 開始の所に置いたタスクの枠（`taskFrame`）。終日は最初の日 1 日。
 * タスクは長さを持たないので、予定の枠から切り替えたときも、タスクのまま空いている所をなぞったときも、
 * 見た目は置いたタスクと同じになる。タスクの枠はそのまま返る。
 */
export function toTaskFrame(range: DraftRange): DraftRange {
  return range.allDay ? allDayDraft(range.from) : taskFrame(range.date, range.startMin);
}

/**
 * タスクの枠を予定の枠にする（入力で種類を切り替えたとき）。引き継ぐのは開始だけで、
 * 時間指定ならタップで作る予定と同じ 1 時間（日の終わりで止める）、終日はその日 1 日。
 */
export function toEventRange(range: DraftRange): DraftRange {
  if (range.allDay) return allDayDraft(range.from);
  const { date, startMin } = range;
  return { allDay: false, date, startMin, endMin: tapEnd(startMin) };
}

/**
 * 枠の端（開始・終了）をつまんで直せるか。タスクは長さを持たないので、どこをつまんでも枠ごと動く
 * （時間軸は端の丸・線を出さず、日の並びは端に当たる所を押しても帯そのもの）。
 */
export function hasEnds(kind: EventKind): boolean {
  return kind !== 'task';
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

/**
 * 並べている日（days）に枠を出しているときの、枠が直している項目（元の帯・ブロックはこれを隠す）。
 * 月表示は週の行ごとに枠を置くので、見えている 6 週のどこかに出ているかをこれで見る
 * （終日欄・時間軸は枠を置く列をそのまま使う）。
 * 枠が出ない間（別の週・月へ動かした、終日を切り替えた）は、保存するまで元の場所に見えているほうが
 * 分かりやすいので隠さない（隠すと、どこにも出ていない予定になる）。
 */
export function editingItemOn(draft: Draft | null, days: DateString[]): CalendarItem | null {
  return draft && draftColumns(draft.range, days) ? draft.item : null;
}

/** タップ・クリック（動かさずに離す）で作る予定の長さ（分） */
const TAP_MINUTES = DEFAULT_EVENT_MINUTES;

/** 時間軸でその分から始まる、タップで作るのと同じ長さの予定の終わり。枠は日をまたげないので日の終わりで止める */
export function tapEnd(startMin: number): number {
  return Math.min(startMin + TAP_MINUTES, DAY_MINUTES);
}
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
export function withAllDay(draft: DraftRange, allDay: boolean, now: Date = new Date()): DraftRange {
  if (draft.allDay === allDay) return draft;
  return draft.allDay ? nextHourDraft(draft.from, now) : allDayDraft(draft.date);
}

/** その日 1 日の終日の下書き */
export function allDayDraft(date: DateString): AllDayDraft {
  return { allDay: true, from: date, to: date };
}

/** 日の並びで下書きが占める期間（両端を含む）。時間指定の下書きはその日 1 日ぶん */
export function draftDays(draft: DraftRange): DateRange {
  return draft.allDay ? draft : { from: draft.date, to: draft.date };
}

/**
 * 並んだ日（月の 1 週、タイムラインの日）のうち下書きが占める列。掛からなければ null。
 * roundStart・roundEnd は本当の端がこの並びに入っているか（週をまたぐ帯は続きとして描く）。
 */
export function draftColumns(
  draft: DraftRange,
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
