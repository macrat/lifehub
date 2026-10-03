import { addDays as addDaysFn } from 'date-fns';
import {
  addDays,
  allDayDate,
  type DateRange,
  diffDays,
  inclusiveEndDate,
  startOfDay,
  toDateString,
  today,
} from './date.ts';
import type { DateString } from './types.ts';
import type { EventKind } from './validation/events.ts';
import type { WeatherInRange } from './weather.ts';

/**
 * カレンダーに並ぶ項目の形と、発生（1 回分）を暦日に置く規則。
 * サーバーの一覧（`server/features/events/occurrences.ts`）と、クライアントの楽観的更新
 * （`src/features/events/optimistic.ts`）が同じ規則を使うため、共通に置く。
 */

/** 保存されている行そのもの（単発、繰り返し元、または実体化された回） */
export type EventMaster = {
  id: string;
  kind: EventKind;
  title: string;
  allDay: boolean;
  startsAt: string | null;
  /** 予定では排他的な終端（終日は翌日 JST 0:00）。タスクでは期限 */
  endsAt: string | null;
  completedAt: string | null;
  location: string | null;
  note: string | null;
  participantIds: string[];
  rrule: string | null;
  remindStartMinutes: number | null;
  remindEndMinutes: number | null;
};

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
      startsAt: string;
      endsAt: string;
      placementDate: DateString;
      /** 複数日の予定での何日目か（1 始まり）と総日数 */
      dayIndex: number;
      dayCount: number;
    })
  | (Occurrence & { kind: 'task'; placementDate: DateString; isOverdue: boolean });
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
 * カレンダーの 1 期間分（`GET /api/calendar`）: 項目と、その期間の祝日（昇順）・天気（日ごとと 3 時間ごと）。
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
  startsAt: Date | null,
  endsAt: Date | null,
): { startsAt: Date | null; endsAt: Date | null } {
  if (!allDay) return { startsAt, endsAt };
  return {
    startsAt: startsAt && startOfDay(startsAt),
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
 * タスクから予定へ切り替えたとき（画面の入力と MCP の更新）と、MCP で終了を省いて予定を入れたときに使う。
 * 画面と MCP が同じ規則で切り替わるよう、ここ 1 か所で決める。
 */
export function defaultEventEnd(allDay: boolean, startsAt: Date): Date {
  return allDay ? startsAt : new Date(startsAt.getTime() + DEFAULT_EVENT_MINUTES * 60_000);
}

/**
 * 保存した日時を入力の形に戻す（`normalizeInstants` の逆）。終日の終了は排他的な終端（翌日 0:00）から
 * 含む最終日の中へ戻す。保存形式のまま入力に渡すと、`normalizeInstants` でもう 1 日延びる。
 * 今の値に一部の項目だけを重ねて更新する書き込み（MCP の部分更新）が、今の値を入力として使うのに使う。
 */
export function toInputInstants(
  allDay: boolean,
  startsAt: Date | null,
  endsAt: Date | null,
): { startsAt: Date | null; endsAt: Date | null } {
  return { startsAt, endsAt: allDay && endsAt ? new Date(endsAt.getTime() - 1) : endsAt };
}

/** ISO 文字列で持つ日時の組（クライアントの入力・楽観的更新）。未設定は null */
type IsoInstants = { startsAt: string | null; endsAt: string | null };

/** `normalizeInstants` の ISO 文字列版。クライアントは日時を ISO 文字列で持つので、Date との往復をここで済ませる */
export function normalizeIsoInstants(
  allDay: boolean,
  startsAt: string | null,
  endsAt: string | null,
): IsoInstants {
  return onIso(normalizeInstants, allDay, startsAt, endsAt);
}

/** `toInputInstants` の ISO 文字列版 */
export function toInputIsoInstants(
  allDay: boolean,
  startsAt: string | null,
  endsAt: string | null,
): IsoInstants {
  return onIso(toInputInstants, allDay, startsAt, endsAt);
}

function onIso(
  convert: typeof normalizeInstants,
  allDay: boolean,
  startsAt: string | null,
  endsAt: string | null,
): IsoInstants {
  const toDate = (iso: string | null) => (iso === null ? null : new Date(iso));
  const result = convert(allDay, toDate(startsAt), toDate(endsAt));
  return {
    startsAt: result.startsAt?.toISOString() ?? null,
    endsAt: result.endsAt?.toISOString() ?? null,
  };
}

/**
 * タスクを示す日時。`date` はその日時の JST の暦日、`at` は時刻。
 * 終日のタスクの開始・期限は日付だけで時刻を持たない（保存上の 0:00 は時刻ではない）ので `at` は null。
 */
export type TaskTime = { kind: 'done' | 'due' | 'start'; date: DateString; at: string | null };

/** タスクの日時の呼び名。行の見出し・詳細・入力欄・クイック入力の見出しで同じ言葉を使う */
export const TASK_TIME_LABELS: Record<TaskTime['kind'], string> = {
  done: '完了',
  start: '開始',
  due: '期限',
};

/**
 * タスクを示す日時（基準日時）: 完了 → 開始 → 期限の優先。どれも無ければ null。
 * 一覧の行・タイムラインのブロック・同日内の並び順が同じ日時を指すよう、規則はここ 1 か所に置く。
 *
 * 完了を先に置くのは、完了したタスクを完了した日に置く `placeTask` と揃えるため。
 * 開始・期限が別の日でも、置かれた日の中では完了した時刻に並び、その時刻で示される。
 * 開始を期限より先に置くのは、未完了のタスクを開始の日に置く `placeTask`、繰り返しの基準日時
 * （`server/features/events/occurrences.ts` の `baseOf`）と揃えるため。予定のブロックも開始の時刻に置くので、
 * タイムラインでは取りかかる時刻に並ぶ。長押しで動かしたタスクは落とした所が開始になる（カレンダーの `task-draft.ts`）ので、
 * 動かした所にそのまま現れる。
 * 終日の期限は排他的な終端（期限日の翌日 0:00）で持つので、日付は含む期限日にする（`allDayDate`）。
 */
export function taskTime(task: TaskTimeSource): TaskTime | null {
  const anchor = taskAnchor(task);
  if (!anchor) return null;
  const { kind, iso, allDay } = anchor;
  return allDay
    ? { kind, date: allDayDate(iso, kind === 'due' ? 'end' : 'start'), at: null }
    : { kind, date: toDateString(new Date(iso)), at: iso };
}

type TaskTimeSource = {
  allDay: boolean;
  startsAt: string | null;
  endsAt: string | null;
  completedAt: string | null;
};

/**
 * `taskTime` がどの日時を指すか（暦日に直す前）。並び順は時刻の文字列だけで決まるので、
 * 1 回の比較ごとにタイムゾーンの計算をしなくて済むよう、ここを直接使う。完了の時刻は終日でも時刻。
 */
function taskAnchor(
  task: TaskTimeSource,
): { kind: TaskTime['kind']; iso: string; allDay: boolean } | null {
  if (task.completedAt) return { kind: 'done', iso: task.completedAt, allDay: false };
  if (task.startsAt) return { kind: 'start', iso: task.startsAt, allDay: task.allDay };
  if (task.endsAt) return { kind: 'due', iso: task.endsAt, allDay: task.allDay };
  return null;
}

/**
 * 置かれた日（`placementDate`）にあるタスクの日時。無い、または別の日を指すときは null。
 * 別の日の日時（繰り越し・期限が別日）はその日の時間軸に置けず、行でも日付を添えなければ示せないので、
 * 出す側がその区別をここ 1 か所から受け取る。
 */
export function taskTimeOnPlacementDate(
  task: Extract<CalendarItem, { kind: 'task' }>,
): TaskTime | null {
  const time = taskTime(task);
  return time?.date === task.placementDate ? time : null;
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
export function placeOnce(occurrence: Occurrence, now: Date): CalendarItem | null {
  if (occurrence.kind === 'task') return placeTask(occurrence, now);
  if (!occurrence.startsAt) return null;
  const first = toDateString(new Date(occurrence.startsAt));
  const todayDate = today(now);
  // 始まる日から今日までの項目の最後の日。期間の外の日は placeEvent が除くので、終わる日で止まる
  const to = occurrence.allDay && todayDate > first ? todayDate : first;
  return placeEvent(occurrence, { from: first, to }).at(-1) ?? null;
}

/** 一覧の並び: placementDate 順、同日内は 終日の項目 → 時刻のある項目 → 時刻の無いタスク */
export function sortItems(items: CalendarItem[]): CalendarItem[] {
  return [...items].sort(compareItems);
}

/**
 * タスクの表示位置（docs/features/events.md）:
 * - 未完了で開始日時が未来 → 開始日時の日。未完了で開始が過去／今日／未設定 → 今日（完了まで繰り越し）
 * - 完了 → 完了した日
 */
function placeTask(occurrence: Occurrence, now: Date): Extract<CalendarItem, { kind: 'task' }> {
  const todayDate = today(now);
  const startsAt = occurrence.startsAt ? new Date(occurrence.startsAt) : null;
  const endsAt = occurrence.endsAt ? new Date(occurrence.endsAt) : null;
  const completedAt = occurrence.completedAt ? new Date(occurrence.completedAt) : null;
  let placementDate: DateString;
  if (completedAt) placementDate = toDateString(completedAt);
  else if (startsAt && toDateString(startsAt) > todayDate) placementDate = toDateString(startsAt);
  else placementDate = todayDate;
  return {
    ...occurrence,
    kind: 'task',
    placementDate,
    isOverdue: !completedAt && endsAt !== null && endsAt.getTime() < now.getTime(),
  };
}

/** 予定の発生を日ごとの項目にする（範囲外の日は除く） */
function placeEvent(
  occurrence: Occurrence,
  range: DateRange,
): Extract<CalendarItem, { kind: 'event' }>[] {
  if (!occurrence.startsAt || !occurrence.endsAt) return [];
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
      kind: 'event',
      startsAt: occurrence.startsAt,
      endsAt: occurrence.endsAt,
      placementDate: day,
      dayIndex: i + 1,
      dayCount,
    });
  }
  return result;
}

/**
 * 同日内の並び順のキー: 終日の予定 → 終日のタスク（日付だけを持つタスク）→ 時刻のある項目（予定の開始、
 * タスクは `taskTime`）→ 日時の無いタスク。
 * 終日の中で予定を先に置くのは、終日の予定はその日そのものの性質（旅行・休みなど）を表し、
 * その日のやることより先に目に入るべきだから。
 * 時刻のある項目は ISO 日時そのもの、その前後は ISO 日時より必ず小さい／大きい番兵で表す
 * （'' < '!' < ISO 日時（数字で始まる）< '~'）。
 * `taskTime` を通すので、行やブロックが示す時刻と並びの基準は必ず同じものになる。
 */
function sortKey(item: CalendarItem): string {
  if (item.kind === 'event') return item.allDay ? '' : item.startsAt;
  const anchor = taskAnchor(item);
  if (!anchor) return '~';
  return anchor.allDay ? '!' : anchor.iso;
}

/**
 * キーは符号位置で比べる（localeCompare を使わない）。ICU の照合は記号の重みが弱く、
 * 時刻の無いタスクの番兵 '~' が ISO 日時より前に来てしまう。並びはサーバーとクライアントで
 * 同じでなければならず、ロケールに左右されてもいけない。
 */
export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareItems(a: CalendarItem, b: CalendarItem): number {
  if (a.placementDate !== b.placementDate) return compareKeys(a.placementDate, b.placementDate);
  return compareKeys(sortKey(a), sortKey(b));
}
