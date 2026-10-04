import { addDays as addDaysFn } from 'date-fns';
import {
  addDays,
  allDayDate,
  type DateRange,
  diffDays,
  inclusiveEndDate,
  startOfDate,
  startOfDay,
  toDateString,
  today,
} from './date.ts';
import { compareKeys } from './sort.ts';
import type { DateString } from './types.ts';
import type { EventKind } from './validation/events.ts';
import type { WeatherInRange } from './weather.ts';

/**
 * カレンダーに並ぶ項目の形と、発生（1 回分）を暦日に置く規則。
 * サーバーの一覧（`server/features/events/occurrences.ts`）と、クライアントの楽観的更新
 * （`src/features/events/optimistic.ts`）が同じ規則を使うため、共通に置く。
 */

/** 予定とタスクで共通の項目 */
type EventCommon = {
  id: string;
  title: string;
  allDay: boolean;
  /** 予定・タスクの開始（終日は JST 0:00） */
  startsAt: string;
  completedAt: string | null;
  location: string | null;
  note: string | null;
  participantIds: string[];
  rrule: string | null;
  remindStartMinutes: number | null;
};

/**
 * 保存されている行そのもの（単発、繰り返し元、または実体化された回）。種別 kind で分ける:
 * 予定は終了（排他的な終端。終日は翌日 JST 0:00）とその前の通知を持ち、タスクは終わりを持たない（null）。
 * 入力の形（`shared/validation/events.ts` の `eventSchemaWith`）・DB の CHECK と同じ分け方で、
 * 行を読む所が種別で絞れば終わりの有無が型で決まる。
 */
export type EventMaster =
  | (EventCommon & { kind: 'event'; endsAt: string; remindEndMinutes: number | null })
  | (EventCommon & { kind: 'task'; endsAt: null; remindEndMinutes: null });

/**
 * 書き込んだ予定・タスク。回だけを変えたときはその回（id は繰り返し元、occurrenceStart が回）、
 * それ以外は書いた行（occurrenceStart は null）。一覧の項目と同じ見方で、書いた物を指し示せる
 */
export type WrittenEvent = EventMaster & { occurrenceStart: string | null };

/** 1 回の発生（繰り返しを展開し、実体化された回を反映したもの）。id は繰り返し元（単発ならその行）の id */
export type Occurrence = EventMaster & {
  /** 繰り返しの回を指す元の発生の基準日時。単発では null */
  occurrenceStart: string | null;
  isRecurring: boolean;
  /** この回だけ、ルールから導かれる値と違う項目があるか */
  isModified: boolean;
};

/**
 * カレンダーが読む項目。placementDate は JST の暦日。
 * 予定は日ごとに 1 件（複数日は dayIndex / dayCount）、タスクは表示規則で 1 件。
 */
export type CalendarItem =
  | (Occurrence & {
      kind: 'event';
      placementDate: DateString;
      /** 複数日の予定での何日目か（1 始まり）と総日数 */
      dayIndex: number;
      dayCount: number;
    })
  | (Occurrence & { kind: 'task'; placementDate: DateString });
export type CalendarEventItem = Extract<CalendarItem, { kind: 'event' }>;
export type CalendarTaskItem = Extract<CalendarItem, { kind: 'task' }>;

/**
 * 発生（繰り返しの 1 回）を指す鍵: 種別・id（繰り返し元、単発ならその行）・繰り返しの回の基準日時。
 * 複数日の予定は日ごとに 1 件で返るが、どの日の項目も同じ鍵になる（暦日は含めない）。
 * 「同じ予定か」を見る所（編集中の予定を隠す、複数日の帯を束ねる、表示の切り替えで動かす）が
 * 同じ規則で比べるよう、ここ 1 か所に置く。
 */
export function occurrenceKey(item: Pick<Occurrence, 'kind' | 'id' | 'occurrenceStart'>): string {
  return `${item.kind}:${item.id}:${item.occurrenceStart ?? ''}`;
}

/** 暦日が期間（両端を含む）の中か */
export function inRange(date: DateString, { from, to }: DateRange): boolean {
  return date >= from && date <= to;
}

/**
 * カレンダーの 1 期間分（`calendar.get`）: 項目と、その期間の祝日（昇順）・天気（日ごとと 3 時間ごと）。
 * どれも期間の外の日は含まない。
 */
export type CalendarPeriod = {
  items: CalendarItem[];
  holidays: DateString[];
  weather: WeatherInRange;
};

/**
 * 入力の日時を保存形式に合わせる。終日は開始をその日の JST 0:00 に、
 * 終了を「終了日（含む）」の翌日 JST 0:00（排他的）にする。
 */
export function normalizeInstants(
  allDay: boolean,
  startsAt: Date,
  endsAt: Date | null,
): { startsAt: Date; endsAt: Date | null } {
  if (!allDay) return { startsAt, endsAt };
  return {
    startsAt: startOfDay(startsAt),
    endsAt: endsAt && addDaysFn(startOfDay(endsAt), 1),
  };
}

/**
 * 開始だけが決まっている予定の長さ（分）。Google カレンダーと同じ 1 時間。
 * グリッドのタップで作る予定（`TAP_MINUTES`）も、タスクから切り替えた予定・MCP で終了を省いた予定もこの長さ
 */
export const DEFAULT_EVENT_MINUTES = 60;

/**
 * 開始だけが決まっている予定の終了（入力の形。終日なら含む最終日）。終日はその日 1 日、時刻ありは 1 時間。
 * タスクから予定へ切り替えたとき（`switchedEnds`）と、MCP で終了を省いて予定を入れたときに使う。
 */
export function defaultEventEnd(allDay: boolean, startsAt: Date): Date {
  return allDay ? startsAt : new Date(startsAt.getTime() + DEFAULT_EVENT_MINUTES * 60_000);
}

/**
 * 開始を決めていない新しいタスクの開始: 登録した日（今日）の終日。
 * MCP で開始を省いてタスクを足したときと、入力の開始が空のまま種類を切り替えたときに使う。
 */
export function defaultTaskStart(now: Date = new Date()): { allDay: true; startsAt: Date } {
  return { allDay: true, startsAt: startOfDate(today(now)) };
}

/**
 * 種類を切り替えた後の終わり（入力の形）。引き継ぐ日時は開始だけ: タスクは終わりを持たず、
 * 予定は開始からの既定の長さ（`defaultEventEnd`）。終了前の通知も終わりを引き継がないので消す。
 * 画面の入力（`switchKindValues`）と MCP の更新（`switchedKind`）が同じ規則で切り替わるよう、ここ 1 か所で決める。
 */
export function switchedEnds(
  kind: EventKind,
  allDay: boolean,
  startsAt: Date,
): { endsAt: Date | null; remindEndMinutes: null } {
  return {
    endsAt: kind === 'event' ? defaultEventEnd(allDay, startsAt) : null,
    remindEndMinutes: null,
  };
}

/**
 * 保存した日時を入力の形に戻す（`normalizeInstants` の逆）。終日の終了は排他的な終端（翌日 0:00）から
 * 含む最終日の中へ戻す。保存形式のまま入力に渡すと、`normalizeInstants` でもう 1 日延びる。
 * 今の値に一部の項目だけを重ねて更新する書き込み（MCP の部分更新）が、今の値を入力として使うのに使う。
 */
export function toInputInstants(
  allDay: boolean,
  startsAt: Date,
  endsAt: Date | null,
): { startsAt: Date; endsAt: Date | null } {
  return { startsAt, endsAt: allDay && endsAt ? new Date(endsAt.getTime() - 1) : endsAt };
}

/** ISO 文字列で持つ日時の組（クライアントの入力・楽観的更新）。終了の無いもの（タスク）は null */
type IsoInstants = { startsAt: string; endsAt: string | null };

/**
 * `normalizeInstants` の ISO 文字列版。クライアントは日時を ISO 文字列で持つので、Date との往復をここで済ませる。
 * 終了を渡せば（予定）終了のある組が返る
 */
export function normalizeIsoInstants(
  allDay: boolean,
  startsAt: string,
  endsAt: string,
): { startsAt: string; endsAt: string };
export function normalizeIsoInstants(
  allDay: boolean,
  startsAt: string,
  endsAt: string | null,
): IsoInstants;
export function normalizeIsoInstants(
  allDay: boolean,
  startsAt: string,
  endsAt: string | null,
): IsoInstants {
  return onIso(normalizeInstants, allDay, startsAt, endsAt);
}

/** `toInputInstants` の ISO 文字列版 */
export function toInputIsoInstants(
  allDay: boolean,
  startsAt: string,
  endsAt: string | null,
): IsoInstants {
  return onIso(toInputInstants, allDay, startsAt, endsAt);
}

function onIso(
  convert: typeof normalizeInstants,
  allDay: boolean,
  startsAt: string,
  endsAt: string | null,
): IsoInstants {
  const result = convert(allDay, new Date(startsAt), endsAt === null ? null : new Date(endsAt));
  return {
    startsAt: result.startsAt.toISOString(),
    endsAt: result.endsAt?.toISOString() ?? null,
  };
}

/**
 * タスクを示す日時。`date` はその日時の JST の暦日、`at` は時刻。
 * 終日のタスクの開始は日付だけで時刻を持たない（保存上の 0:00 は時刻ではない）ので `at` は null。
 */
export type TaskTime = { kind: 'done' | 'start'; date: DateString; at: string | null };

/** 予定・タスクの端（開始・予定の終了）の呼び名。入力欄・通知の本文・詳細で同じ言葉を使う */
export const EDGE_LABELS = { start: '開始', end: '終了' } as const;

/** タスクの日時の呼び名。行の見出し・詳細・クイック入力の見出しで同じ言葉を使う */
export const TASK_TIME_LABELS: Record<TaskTime['kind'], string> = {
  done: '完了',
  start: EDGE_LABELS.start,
};

/**
 * タスクを示す日時（基準日時）: 完了していれば完了、していなければ開始。
 * 一覧の行・タイムラインのブロック・同日内の並び順が同じ日時を指すよう、規則はここ 1 か所に置く。
 * 完了を先に置くのは、完了したタスクを完了した日に置く `placeTask` と揃えるため。
 * 開始が別の日でも、置かれた日の中では完了した時刻に並び、その時刻で示される。
 */
export function taskTime(task: TaskTimeSource): TaskTime {
  const { kind, iso, allDay } = taskAnchor(task);
  return allDay
    ? { kind, date: allDayDate(iso, 'start'), at: null }
    : { kind, date: toDateString(new Date(iso)), at: iso };
}

type TaskTimeSource = { allDay: boolean; startsAt: string; completedAt: string | null };

/**
 * `taskTime` がどの日時を指すか（暦日に直す前）。並び順は時刻の文字列だけで決まるので、
 * 1 回の比較ごとにタイムゾーンの計算をしなくて済むよう、ここを直接使う。完了の時刻は終日でも時刻。
 */
function taskAnchor(task: TaskTimeSource): {
  kind: TaskTime['kind'];
  iso: string;
  allDay: boolean;
} {
  if (task.completedAt) return { kind: 'done', iso: task.completedAt, allDay: false };
  return { kind: 'start', iso: task.startsAt, allDay: task.allDay };
}

/**
 * 置かれた日（`placementDate`）にあるタスクの日時。別の日を指すときは null。
 * 別の日の日時（今日へ繰り越した開始）はその日の時間軸に置けず、行でも日付を添えなければ示せないので、
 * 出す側がその区別をここ 1 か所から受け取る。
 */
export function taskTimeOnPlacementDate(
  task: Extract<CalendarItem, { kind: 'task' }>,
  /** 求め済みの `taskTime`（無ければここで求める） */
  time: TaskTime = taskTime(task),
): TaskTime | null {
  return time.date === task.placementDate ? time : null;
}

/** 項目を置く日（placementDate）ごとにまとめる（順序はサーバーの並びを保つ） */
export function groupByDate(items: CalendarItem[]): Map<DateString, CalendarItem[]> {
  return Map.groupBy(items, (item) => item.placementDate);
}

/**
 * 完了したタスクか。予定には完了が無いので常に false。
 * 打ち消し線とチェック印、リストの絞り込み、月グリッドの並びが同じ規則を見るよう、ここ 1 か所に置く。
 */
export function isCompletedTask(item: CalendarItem): boolean {
  return item.kind === 'task' && item.completedAt !== null;
}

/** 発生を [from, to] の暦日に置く（範囲に掛からなければ空）。予定は掛かる日ごとに 1 件 */
export function placeOccurrence(
  occurrence: Occurrence,
  range: DateRange,
  now: Date,
): CalendarItem[] {
  if (occurrence.kind === 'event') return placeEvent(occurrence, range);
  const task = placeTask(occurrence, now);
  return inRange(task.placementDate, range) ? [task] : [];
}

/**
 * 発生を暦日の範囲によらず 1 件の項目にする。日ごとに割らずに 1 回の発生を 1 行で出す所
 * （ホームのタイムライン）が、カレンダーと同じ形の項目を詳細にそのまま渡せるようにする。
 * - 時刻のある予定: 始まる日（複数日でも 1 日目だけ）
 * - 終日の予定: 今日が期間に入っていれば今日、終わっていれば終わる日、まだなら始まる日
 *   （今日を含む予定は、終わるまで今日の予定として出す）
 * - タスク: 表示規則（`placeTask`）の日
 */
export function placeOnce(occurrence: Occurrence, now: Date): CalendarItem {
  if (occurrence.kind === 'task') return placeTask(occurrence, now);
  const first = toDateString(new Date(occurrence.startsAt));
  const todayDate = today(now);
  // 始まる日から今日までの項目の最後の日。期間の外の日は placeEvent が除くので、終わる日で止まる
  const to = occurrence.allDay && todayDate > first ? todayDate : first;
  const items = placeEvent(occurrence, { from: first, to });
  // 始まる日は必ず期間に入るので、少なくとも 1 件ある
  return items[items.length - 1] as CalendarItem;
}

/** 一覧の並び: placementDate 順、同日内は 終日の項目 → 時刻のある項目 */
export function sortItems(items: CalendarItem[]): CalendarItem[] {
  return [...items].sort(compareItems);
}

/**
 * タスクの表示位置（docs/features/events.md）:
 * - 未完了で開始が未来の日 → 開始の日。未完了で開始が過去／今日 → 今日（完了まで繰り越し）
 * - 完了 → 完了した日
 */
function placeTask(
  occurrence: Extract<Occurrence, { kind: 'task' }>,
  now: Date,
): Extract<CalendarItem, { kind: 'task' }> {
  const { completedAt, startsAt } = occurrence;
  // 開始が今より前なら今日（暦日に直すのは置く日の 1 回だけ）
  const placementDate = completedAt
    ? toDateString(new Date(completedAt))
    : Date.parse(startsAt) <= now.getTime()
      ? today(now)
      : toDateString(new Date(startsAt));
  return { ...occurrence, placementDate };
}

/** 予定の発生を日ごとの項目にする（範囲外の日は除く） */
function placeEvent(
  occurrence: Extract<Occurrence, { kind: 'event' }>,
  range: DateRange,
): Extract<CalendarItem, { kind: 'event' }>[] {
  const startsAt = new Date(occurrence.startsAt);
  const endsAt = new Date(occurrence.endsAt);
  const firstDay = toDateString(startsAt);
  // 終端は排他的なので含む最終日にする。長さ 0 なら開始日
  const lastDay =
    endsAt.getTime() > startsAt.getTime() ? inclusiveEndDate(occurrence.endsAt) : firstDay;
  const dayCount = diffDays(firstDay, lastDay) + 1;
  const result: Extract<CalendarItem, { kind: 'event' }>[] = [];
  for (let i = 0; i < dayCount; i++) {
    const day = addDays(firstDay, i);
    if (day < range.from || day > range.to) continue;
    result.push({
      ...occurrence,
      placementDate: day,
      dayIndex: i + 1,
      dayCount,
    });
  }
  return result;
}

/**
 * 同日内の並び順のキー: 終日の予定 → 終日のタスク（日付だけを持つタスク）→ 時刻のある項目（予定の開始、
 * タスクは `taskTime`）。
 * 終日の中で予定を先に置くのは、終日の予定はその日そのものの性質（旅行・休みなど）を表し、
 * その日のやることより先に目に入るべきだから。
 * 時刻のある項目は ISO 日時そのもの、終日は ISO 日時より必ず小さい番兵で表す（'' < '!' < ISO 日時（数字で始まる））。
 * `taskTime` を通すので、行やブロックが示す時刻と並びの基準は必ず同じものになる。
 */
function sortKey(item: CalendarItem): string {
  if (item.kind === 'event') return item.allDay ? '' : item.startsAt;
  // `taskAnchor` と同じ規則を、比べるたびに物を作らずに読む（並べ替えは件数 × log 回呼ばれる）
  return item.completedAt ?? (item.allDay ? '!' : item.startsAt);
}

function compareItems(a: CalendarItem, b: CalendarItem): number {
  if (a.placementDate !== b.placementDate) return compareKeys(a.placementDate, b.placementDate);
  return compareKeys(sortKey(a), sortKey(b));
}
