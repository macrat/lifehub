import { addDays, diffDays, startOfDate, toDateString, today } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import type { EventKind } from '../../../shared/validation/events.ts';
import { expandOccurrences, iterateOccurrences } from '../../lib/recurrence/index.ts';
import * as repository from './repository.ts';
import type { EventRow } from './schema.ts';

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

/** 1 回の発生（繰り返しを展開し、実体化された回を反映したもの）。id は繰り返し元（単発ならその行）の id */
type Occurrence = EventMaster & {
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

type DateRange = { from: DateString; to: DateString };

/** 同時に表示する未完了の発生の上限（繰り返しタスク） */
const MAX_VISIBLE_UNCOMPLETED = 2;

/**
 * [from, to]（両端含む JST 暦日）の項目を placementDate 順に返す。
 * 同日内は「終日の予定 → 時刻のある項目（予定の開始、タスクの開始または期限）→ 時刻の無いタスク」。
 */
export async function listItems(range: DateRange, now: Date = new Date()): Promise<CalendarItem[]> {
  const instants = { from: startOfDate(range.from), to: startOfDate(addDays(range.to, 1)) };
  const masters = await repository.findCandidates(instants.from, instants.to);
  const occurrenceRows = await repository.findBySeriesIds(masters.map((m) => m.id));
  const participants = groupParticipants(
    await repository.findParticipants([...masters, ...occurrenceRows].map((r) => r.id)),
  );
  const bySeries = new Map<string, Map<number, EventRow>>();
  for (const row of occurrenceRows) {
    if (!row.seriesId || !row.occurrenceStart) continue;
    const inner = bySeries.get(row.seriesId) ?? new Map<number, EventRow>();
    inner.set(row.occurrenceStart.getTime(), row);
    bySeries.set(row.seriesId, inner);
  }

  const items: CalendarItem[] = [];
  for (const master of masters) {
    const ctx: ExpandContext = {
      master,
      occurrences: bySeries.get(master.id) ?? new Map(),
      participantsOf: (id) => participants.get(id) ?? [],
    };
    if (master.kind === 'event') {
      for (const occurrence of expandEvent(ctx, instants))
        items.push(...placeEvent(occurrence, range));
    } else {
      items.push(
        ...expandTask(ctx, now, range).filter(
          (o) => o.placementDate >= range.from && o.placementDate <= range.to,
        ),
      );
    }
  }
  return items.sort(compareItems);
}

export function toMaster(row: EventRow, participantIds: string[]): EventMaster {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    allDay: row.allDay,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    location: row.location,
    note: row.note,
    participantIds,
    rrule: row.rrule,
    remindStartMinutes: row.remindStartMinutes,
    remindEndMinutes: row.remindEndMinutes,
  };
}

/** 繰り返しの基準日時（DTSTART）: starts_at、無ければ ends_at */
export function baseOf(row: { startsAt: Date | null; endsAt: Date | null }): Date | null {
  return row.startsAt ?? row.endsAt;
}

/** 繰り返し元の日時を、基準日時が occurrenceStart になるようずらしたもの。開始と終了の間隔は保つ */
export function shiftTo(
  master: EventRow,
  occurrenceStart: Date,
): { startsAt: Date | null; endsAt: Date | null } {
  const base = baseOf(master);
  const delta = base ? occurrenceStart.getTime() - base.getTime() : 0;
  return {
    startsAt: master.startsAt ? new Date(master.startsAt.getTime() + delta) : null,
    endsAt: master.endsAt ? new Date(master.endsAt.getTime() + delta) : null,
  };
}

/** 繰り返しの回が実在するか（ルール上の発生の基準日時か） */
export function occurrenceExists(master: EventRow, at: Date): boolean {
  const base = baseOf(master);
  if (!master.rrule || !base) return false;
  const hits = expandOccurrences({
    rrule: master.rrule,
    dtstart: base,
    from: at,
    to: new Date(at.getTime() + 1000),
  });
  return hits.length > 0;
}

// ---- 内部 ----

type ExpandContext = {
  master: EventRow;
  /** 実体化された回（基準日時のミリ秒 → 行） */
  occurrences: Map<number, EventRow>;
  participantsOf: (id: string) => string[];
};

function groupParticipants(rows: repository.ParticipantRow[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.eventId) ?? [];
    list.push(row.userId);
    map.set(row.eventId, list);
  }
  return map;
}

/** ルール上の回の値（実体化されていない回）、または実体化された行の値から発生を組み立てる */
function buildOccurrence(
  ctx: ExpandContext,
  occurrenceStart: Date | null,
  row: EventRow | undefined,
): Occurrence {
  const { master } = ctx;
  if (!row) {
    const shifted = occurrenceStart ? shiftTo(master, occurrenceStart) : master;
    return {
      ...toMaster(master, ctx.participantsOf(master.id)),
      startsAt: shifted.startsAt?.toISOString() ?? null,
      endsAt: shifted.endsAt?.toISOString() ?? null,
      occurrenceStart: occurrenceStart?.toISOString() ?? null,
      isRecurring: master.rrule !== null,
      isModified: false,
    };
  }
  const participantIds = ctx.participantsOf(row.id);
  return {
    ...toMaster(row, participantIds),
    id: master.id,
    rrule: master.rrule,
    occurrenceStart: row.occurrenceStart?.toISOString() ?? null,
    isRecurring: true,
    isModified: differsFromRule(ctx, row),
  };
}

/** 実体化された行が、ルールから導かれる値（日時をずらした繰り返し元）と違うか */
function differsFromRule(ctx: ExpandContext, row: EventRow): boolean {
  const { master } = ctx;
  if (!row.occurrenceStart) return true;
  const shifted = shiftTo(master, row.occurrenceStart);
  const sameInstant = (a: Date | null, b: Date | null) =>
    (a?.getTime() ?? null) === (b?.getTime() ?? null);
  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && a.every((x) => b.includes(x));
  return !(
    row.title === master.title &&
    row.allDay === master.allDay &&
    sameInstant(row.startsAt, shifted.startsAt) &&
    sameInstant(row.endsAt, shifted.endsAt) &&
    row.location === master.location &&
    row.note === master.note &&
    row.remindStartMinutes === master.remindStartMinutes &&
    row.remindEndMinutes === master.remindEndMinutes &&
    sameSet(ctx.participantsOf(row.id), ctx.participantsOf(master.id))
  );
}

function overlaps(startsAt: Date, endsAt: Date, range: { from: Date; to: Date }): boolean {
  if (startsAt.getTime() >= range.to.getTime()) return false;
  if (endsAt.getTime() > range.from.getTime()) return true;
  // 長さ 0 の予定は開始が範囲内なら含める
  return endsAt.getTime() === startsAt.getTime() && startsAt.getTime() >= range.from.getTime();
}

/** 予定: [from, to) と重なる発生 */
function expandEvent(ctx: ExpandContext, range: { from: Date; to: Date }): Occurrence[] {
  const { master } = ctx;
  if (!master.startsAt || !master.endsAt) return [];
  const duration = master.endsAt.getTime() - master.startsAt.getTime();
  const starts = master.rrule
    ? expandOccurrences({
        rrule: master.rrule,
        dtstart: master.startsAt,
        from: new Date(range.from.getTime() - duration),
        to: range.to,
      })
    : [null];

  const result: Occurrence[] = [];
  const seen = new Set<number>();
  const push = (occurrenceStart: Date | null, row: EventRow | undefined) => {
    if (row?.cancelled) return;
    const occurrence = buildOccurrence(ctx, occurrenceStart, row);
    if (!occurrence.startsAt || !occurrence.endsAt) return;
    if (!overlaps(new Date(occurrence.startsAt), new Date(occurrence.endsAt), range)) return;
    result.push(occurrence);
  };
  for (const start of starts) {
    if (start) seen.add(start.getTime());
    push(start, start ? ctx.occurrences.get(start.getTime()) : undefined);
  }
  // 範囲外の回が「この回だけ」の変更で範囲内に移動している場合
  for (const [key, row] of ctx.occurrences) {
    if (seen.has(key)) continue;
    push(row.occurrenceStart, row);
  }
  return result;
}

type TaskItem = Extract<CalendarItem, { kind: 'task' }>;

/**
 * タスクの表示位置（docs/features/events.md）:
 * - 未完了で開始日時が未来 → 開始日時の日。未完了で開始が過去／今日／未設定 → 今日（完了まで繰り越し）
 * - 完了 → 完了した日
 */
function placeTask(occurrence: Occurrence, now: Date): TaskItem {
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

/**
 * タスク: 繰り返しは、取り消されていない未完了の発生のうち基準日時が最も早い 2 つだけを表示する。
 * 未完了の発生 N は発生 N+2 の基準日時が到来した時点で放棄される（保存せず計算で導く）。
 */
function expandTask(ctx: ExpandContext, now: Date, range: DateRange): TaskItem[] {
  const { master } = ctx;
  if (!master.rrule) return [placeTask(buildOccurrence(ctx, null, undefined), now)];
  const base = baseOf(master);
  if (!base) return [];

  // 発生を先読みしながら走査する。放棄の判定に N+2 の基準日時が要るため 2 つ先まで取り出す。
  const iterator = iterateOccurrences({ rrule: master.rrule, dtstart: base });
  const bases: Date[] = [];
  let exhausted = false;
  const ensure = (index: number): Date | undefined => {
    while (bases.length <= index && !exhausted) {
      const next = iterator.next();
      if (next.done) exhausted = true;
      else bases.push(next.value);
    }
    return bases[index];
  };

  const rangeEnd = startOfDate(addDays(range.to, 1));
  const result: TaskItem[] = [];
  const emitted = new Set<number>();
  let visibleUncompleted = 0;
  for (let n = 0; visibleUncompleted < MAX_VISIBLE_UNCOMPLETED; n++) {
    const at = ensure(n);
    if (!at) break;
    // 範囲の終わりより先の発生は範囲内に表示されない（未完了の先頭 2 つはこれより前に決まっている）
    if (at.getTime() >= rangeEnd.getTime()) break;
    const row = ctx.occurrences.get(at.getTime());
    if (row?.cancelled) continue;
    if (row?.completedAt) {
      emitted.add(at.getTime());
      result.push(placeTask(buildOccurrence(ctx, at, row), now));
      continue;
    }
    const twoAhead = ensure(n + 2);
    const abandoned = twoAhead !== undefined && twoAhead.getTime() <= now.getTime();
    if (abandoned) continue;
    visibleUncompleted++;
    emitted.add(at.getTime());
    result.push(placeTask(buildOccurrence(ctx, at, row), now));
  }

  // 走査の外で完了した回（走査の打ち切り後や、既に放棄された回の完了）も完了日に表示する
  for (const [key, row] of ctx.occurrences) {
    if (emitted.has(key) || row.cancelled || !row.completedAt) continue;
    result.push(placeTask(buildOccurrence(ctx, row.occurrenceStart, row), now));
  }
  return result;
}

type EventItem = Extract<CalendarItem, { kind: 'event' }>;

/** 予定の発生を日ごとの項目にする（範囲外の日は除く） */
function placeEvent(occurrence: Occurrence, range: DateRange): EventItem[] {
  if (!occurrence.startsAt || !occurrence.endsAt) return [];
  const startsAt = new Date(occurrence.startsAt);
  const endsAt = new Date(occurrence.endsAt);
  const firstDay = toDateString(startsAt);
  // 終端は排他的なので 1ms 手前の日。長さ 0 なら開始日
  const lastDay =
    endsAt.getTime() > startsAt.getTime() ? toDateString(new Date(endsAt.getTime() - 1)) : firstDay;
  const dayCount = diffDays(firstDay, lastDay) + 1;
  const result: EventItem[] = [];
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

/** 同日内の並び順のキー: 終日の予定 → 時刻のある項目（予定の開始、タスクの開始または期限）→ 時刻の無いタスク */
function sortKey(item: CalendarItem): string {
  if (item.kind === 'event') return item.allDay ? '' : item.startsAt;
  return item.startsAt ?? item.endsAt ?? '~';
}

function compareItems(a: CalendarItem, b: CalendarItem): number {
  if (a.placementDate !== b.placementDate) return a.placementDate < b.placementDate ? -1 : 1;
  return sortKey(a).localeCompare(sortKey(b));
}
