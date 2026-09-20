import { addDays as addDaysFn } from 'date-fns';
import { startOfDay } from '../../../shared/date.ts';
import type {
  CreateEventInput,
  DeleteEventInput,
  RecurrenceScope,
  UpdateEventInput,
} from '../../../shared/validation/events.ts';
import { NotFoundError, ValidationError } from '../../lib/errors.ts';
import { enqueueUpcoming } from '../../lib/notifications/service.ts';
import { expandOccurrences, normalizeRRule, withUntilBefore } from '../../lib/recurrence/index.ts';
import * as repository from './repository.ts';
import type { EventOverrideRow, EventRow } from './schema.ts';

/** マスター（保存されている予定そのもの） */
export type EventMaster = {
  id: string;
  title: string;
  startsAt: string;
  /** 排他的。終日は翌日 JST 0:00 */
  endsAt: string;
  allDay: boolean;
  ownerUserId: string | null;
  location: string | null;
  note: string | null;
  rrule: string | null;
  remindBeforeMinutes: number | null;
};

/** 期間内の 1 回の発生（繰り返しを展開し、例外を適用したもの） */
export type EventOccurrence = EventMaster & {
  /** 元の発生の開始日時。例外の照合キー。単発では startsAt と同じ */
  occurrenceStart: string;
  isRecurring: boolean;
  /** この回だけ変更されているか */
  isModified: boolean;
};

export async function getEvent(id: string): Promise<EventMaster> {
  const row = await repository.findById(id);
  if (!row) throw new NotFoundError('予定が見つかりません');
  return toMaster(row);
}

/** [from, to) と重なる発生を開始日時順に返す */
export async function listOccurrences(range: { from: Date; to: Date }): Promise<EventOccurrence[]> {
  const masters = await repository.findCandidates(range.from, range.to);
  const overrides = groupOverrides(
    await repository.findOverridesByEventIds(masters.map((m) => m.id)),
  );
  const result: EventOccurrence[] = [];
  for (const master of masters) {
    result.push(...expandMaster(master, overrides.get(master.id) ?? new Map(), range));
  }
  return result.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export async function createEvent(input: CreateEventInput, userId: string): Promise<EventMaster> {
  const row = await repository.insert({ ...normalizeInput(input), createdBy: userId });
  await enqueueUpcoming();
  return toMaster(row);
}

export async function updateEvent(
  id: string,
  input: UpdateEventInput,
  userId: string,
): Promise<EventMaster> {
  const result = await applyUpdate(id, input, userId);
  // 当日〜翌日に新たな通知が発生する場合はその場で予約する（重複は dedupe で防ぐ）
  await enqueueUpcoming();
  return result;
}

async function applyUpdate(
  id: string,
  input: UpdateEventInput,
  userId: string,
): Promise<EventMaster> {
  const master = await repository.findById(id);
  if (!master) throw new NotFoundError('予定が見つかりません');
  const scope = effectiveScope(master, input.scope, input.occurrenceStart);

  if (scope === 'this') {
    const occurrenceStart = requireOccurrenceStart(input.occurrenceStart);
    const values = normalizeInput({ ...input, allDay: master.allDay });
    await repository.upsertOverride({
      eventId: id,
      occurrenceStart,
      cancelled: false,
      startsAt: values.startsAt,
      endsAt: values.endsAt,
      title: values.title,
      note: values.note,
      createdBy: userId,
    });
    return toMaster(master);
  }

  if (scope === 'following') {
    const splitAt = requireOccurrenceStart(input.occurrenceStart);
    const newId = await repository.splitFollowing({
      masterId: id,
      masterRRule: withUntilBefore(master.rrule ?? '', splitAt),
      splitAt,
      newRow: { ...normalizeInput(input), createdBy: userId },
    });
    return getEvent(newId);
  }

  const values = normalizeInput(input);
  const updated = await repository.update(id, values);
  if (!updated) throw new NotFoundError('予定が見つかりません');
  // 開始日時や繰り返しが変わると例外の照合キー（元の発生日時）が意味を失うため捨てる
  if (values.startsAt.getTime() !== master.startsAt.getTime() || values.rrule !== master.rrule) {
    await repository.deleteOverrides(id);
  }
  return toMaster(updated);
}

export async function deleteEvent(
  id: string,
  input: DeleteEventInput,
  userId: string,
): Promise<void> {
  const master = await repository.findById(id);
  if (!master) throw new NotFoundError('予定が見つかりません');
  const scope = effectiveScope(master, input.scope, input.occurrenceStart);

  if (scope === 'this') {
    await repository.upsertOverride({
      eventId: id,
      occurrenceStart: requireOccurrenceStart(input.occurrenceStart),
      cancelled: true,
      startsAt: null,
      endsAt: null,
      title: null,
      note: null,
      createdBy: userId,
    });
    return;
  }
  if (scope === 'following') {
    const splitAt = requireOccurrenceStart(input.occurrenceStart);
    await repository.truncateFollowing({
      masterId: id,
      masterRRule: withUntilBefore(master.rrule ?? '', splitAt),
      splitAt,
    });
    return;
  }
  await repository.remove(id);
}

// ---- 内部 ----

/** 単発の予定は常に all。繰り返しでも先頭の発生に対する following は all と同じ。 */
function effectiveScope(
  master: EventRow,
  scope: RecurrenceScope,
  occurrenceStart: Date | undefined,
): RecurrenceScope {
  if (!master.rrule) return 'all';
  if (scope === 'following' && occurrenceStart?.getTime() === master.startsAt.getTime())
    return 'all';
  return scope;
}

function requireOccurrenceStart(value: Date | undefined): Date {
  if (!value) throw new ValidationError('occurrenceStart が必要です');
  return value;
}

/**
 * 入力を保存形式に整える。
 * - 終日: startsAt はその日の JST 0:00、endsAt は「終了日（含む）」の翌日 JST 0:00（排他的）
 * - rrule: 正規形にする
 */
function normalizeInput(input: CreateEventInput) {
  let { startsAt, endsAt } = input;
  if (input.allDay) {
    startsAt = startOfDay(startsAt);
    endsAt = addDaysFn(startOfDay(endsAt), 1);
  }
  const rrule = input.rrule ? normalizeRRule(input.rrule) : null;
  return {
    title: input.title,
    allDay: input.allDay,
    startsAt,
    endsAt,
    ownerUserId: input.ownerUserId,
    location: input.location,
    note: input.note,
    rrule,
    remindBeforeMinutes: input.remindBeforeMinutes,
  };
}

function toMaster(row: EventRow): EventMaster {
  return {
    id: row.id,
    title: row.title,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    allDay: row.allDay,
    ownerUserId: row.ownerUserId,
    location: row.location,
    note: row.note,
    rrule: row.rrule,
    remindBeforeMinutes: row.remindBeforeMinutes,
  };
}

type OverrideMap = Map<number, EventOverrideRow>;

function groupOverrides(rows: EventOverrideRow[]): Map<string, OverrideMap> {
  const map = new Map<string, OverrideMap>();
  for (const row of rows) {
    const inner = map.get(row.eventId) ?? new Map<number, EventOverrideRow>();
    inner.set(row.occurrenceStart.getTime(), row);
    map.set(row.eventId, inner);
  }
  return map;
}

function overlaps(startsAt: Date, endsAt: Date, range: { from: Date; to: Date }): boolean {
  if (startsAt.getTime() >= range.to.getTime()) return false;
  if (endsAt.getTime() > range.from.getTime()) return true;
  // 長さ 0 の予定は開始が範囲内なら含める
  return endsAt.getTime() === startsAt.getTime() && startsAt.getTime() >= range.from.getTime();
}

function expandMaster(
  master: EventRow,
  overrides: OverrideMap,
  range: { from: Date; to: Date },
): EventOccurrence[] {
  const duration = master.endsAt.getTime() - master.startsAt.getTime();
  const starts = master.rrule
    ? expandOccurrences({
        rrule: master.rrule,
        dtstart: master.startsAt,
        from: new Date(range.from.getTime() - duration),
        to: range.to,
      })
    : [master.startsAt];

  const seen = new Set<number>();
  const result: EventOccurrence[] = [];
  const push = (occurrenceStart: Date, override: EventOverrideRow | undefined) => {
    if (override?.cancelled) return;
    const startsAt = override?.startsAt ?? occurrenceStart;
    const endsAt = override?.endsAt ?? new Date(startsAt.getTime() + duration);
    if (!overlaps(startsAt, endsAt, range)) return;
    result.push({
      ...toMaster(master),
      occurrenceStart: occurrenceStart.toISOString(),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      title: override?.title ?? master.title,
      note: override?.note ?? master.note,
      isRecurring: master.rrule !== null,
      isModified: override !== undefined,
    });
  };

  for (const start of starts) {
    seen.add(start.getTime());
    push(start, overrides.get(start.getTime()));
  }
  // 範囲外の発生が「この回だけ」の変更で範囲内に移動している場合
  for (const [key, override] of overrides) {
    if (seen.has(key)) continue;
    push(override.occurrenceStart, override);
  }
  return result;
}
