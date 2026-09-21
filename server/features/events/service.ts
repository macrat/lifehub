import { normalizeInstants } from '../../../shared/calendar.ts';
import { newId } from '../../../shared/id.ts';
import type {
  CompleteEventInput,
  CreateEventInput,
  DeleteEventInput,
  RecurrenceScope,
  UpdateEventInput,
} from '../../../shared/validation/events.ts';
import { NotFoundError, ValidationError } from '../../lib/errors.ts';
import { enqueueUpcoming } from '../../lib/notifications/service.ts';
import { normalizeRRule, withUntilBefore } from '../../lib/recurrence/index.ts';
import { baseOf, type EventMaster, occurrenceExists, shiftTo, toMaster } from './occurrences.ts';
import type { EventWithParticipants } from './repository.ts';
import * as repository from './repository.ts';
import type { NewEventRow } from './schema.ts';

export { listItems } from './occurrences.ts';

export async function getEvent(id: string): Promise<EventMaster> {
  return toMaster(await findMaster(id));
}

/** id はクライアントが決めて送ってくる（`createEventRequestSchema`）。省略された呼び出し（MCP）はここで採番する */
export async function createEvent(
  input: CreateEventInput,
  userId: string,
  id: string = newId(),
): Promise<EventMaster> {
  const values = normalizeInput(input);
  await repository.insert({ ...values, id, createdBy: userId }, input.participantIds);
  await enqueueUpcoming();
  // 保存した値はすべて手元にあるので読み直さない（往復を 1 回減らす）
  return savedMaster(id, values, input.participantIds);
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
  const master = await findMaster(id);
  if (input.kind !== master.kind) throw new ValidationError('種別は変更できません');
  const scope = effectiveScope(master, input.scope, input.occurrenceStart);
  const values = normalizeInput(input);

  if (scope === 'this') {
    const occurrenceStart = requireOccurrence(master, input.occurrenceStart);
    // 実体化された回は繰り返さない（繰り返しは元の行だけが持つ）
    await materialize(
      master,
      occurrenceStart,
      { ...values, rrule: null, cancelled: false },
      input.participantIds,
      userId,
    );
    // 変わったのは回の行で、繰り返し元は読んだままなので、それをそのまま返す
    return toMaster(master);
  }

  if (scope === 'following') {
    const splitAt = requireOccurrence(master, input.occurrenceStart);
    const splitId = await repository.splitFollowing({
      masterId: id,
      masterRRule: withUntilBefore(master.rrule ?? '', splitAt),
      splitAt,
      newRow: { ...values, createdBy: userId },
      participantIds: input.participantIds,
    });
    return savedMaster(splitId, values, input.participantIds);
  }

  await repository.update(id, values, {
    participantIds: input.participantIds,
    dropUncompletedOccurrences:
      baseOf(values)?.getTime() !== baseOf(master)?.getTime() || values.rrule !== master.rrule,
  });
  return savedMaster(id, values, input.participantIds, master.completedAt);
}

export async function deleteEvent(
  id: string,
  input: DeleteEventInput,
  userId: string,
): Promise<void> {
  const master = await findMaster(id);
  const scope = effectiveScope(master, input.scope, input.occurrenceStart);

  if (scope === 'this') {
    const occurrenceStart = requireOccurrence(master, input.occurrenceStart);
    await materialize(master, occurrenceStart, { cancelled: true }, undefined, userId);
    return;
  }
  if (scope === 'following') {
    const splitAt = requireOccurrence(master, input.occurrenceStart);
    await repository.truncateFollowing({
      masterId: id,
      masterRRule: withUntilBefore(master.rrule ?? '', splitAt),
      splitAt,
    });
    return;
  }
  await repository.remove(id);
}

/** タスクの回を完了にする。完了日時は今 */
export async function completeEvent(
  id: string,
  input: CompleteEventInput,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await setCompletedAt(id, input, now, userId);
}

export async function uncompleteEvent(
  id: string,
  input: CompleteEventInput,
  userId: string,
): Promise<void> {
  await setCompletedAt(id, input, null, userId);
}

// ---- 内部 ----

async function findMaster(id: string): Promise<EventWithParticipants> {
  const row = await repository.findById(id);
  if (!row) throw new NotFoundError('見つかりません');
  return row;
}

/**
 * 今しがた保存した値から応答を組み立てる（読み直さずに往復を 1 回減らす）。
 * 完了状態は入力に無く保存でも変わらないので、呼び出し元が保存前の値をそのまま渡す。
 */
function savedMaster(
  id: string,
  values: ReturnType<typeof normalizeInput>,
  participantIds: string[],
  completedAt: Date | null = null,
): EventMaster {
  return {
    ...values,
    id,
    startsAt: values.startsAt?.toISOString() ?? null,
    endsAt: values.endsAt?.toISOString() ?? null,
    completedAt: completedAt?.toISOString() ?? null,
    participantIds,
  };
}

async function setCompletedAt(
  id: string,
  input: CompleteEventInput,
  completedAt: Date | null,
  userId: string,
): Promise<void> {
  const master = await findMaster(id);
  if (master.kind !== 'task') throw new ValidationError('予定は完了にできません');
  if (!master.rrule) {
    await repository.update(id, { completedAt });
    return;
  }
  const occurrenceStart = requireOccurrence(master, input.occurrenceStart);
  await materialize(master, occurrenceStart, { completedAt }, undefined, userId);
}

/** 単発は常に all。繰り返しでも先頭の発生に対する following は all と同じ。 */
function effectiveScope(
  master: { rrule: string | null; startsAt: Date | null; endsAt: Date | null },
  scope: RecurrenceScope,
  occurrenceStart: Date | undefined,
): RecurrenceScope {
  if (!master.rrule) return 'all';
  if (scope === 'following' && occurrenceStart?.getTime() === baseOf(master)?.getTime())
    return 'all';
  return scope;
}

/** 繰り返しの回の指定を検証する（ルール上に実在する発生の基準日時であること） */
function requireOccurrence(
  master: { rrule: string | null; startsAt: Date | null; endsAt: Date | null },
  value: Date | undefined,
): Date {
  if (!value) throw new ValidationError('occurrenceStart が必要です');
  if (!occurrenceExists(master, value)) throw new ValidationError('その回は存在しません');
  return value;
}

/**
 * 繰り返しの回を実体化する（無ければ繰り返し元の複製に values を重ねて作り、あれば values だけを当てる）。
 * 参加者は、指定があれば置き換え、新しく作るときは繰り返し元から複製する。
 */
async function materialize(
  master: EventWithParticipants,
  occurrenceStart: Date,
  values: Partial<NewEventRow>,
  participantIds: string[] | undefined,
  userId: string,
): Promise<void> {
  const { id: _id, createdAt: _c, updatedAt: _u, participantIds: _p, ...copy } = master;
  const { id, inserted } = await repository.upsertOccurrence(
    {
      ...copy,
      ...shiftTo(master, occurrenceStart),
      rrule: null,
      seriesId: master.id,
      occurrenceStart,
      createdBy: userId,
      ...values,
    },
    values,
  );
  const ids = participantIds ?? (inserted ? master.participantIds : undefined);
  if (ids) await repository.setParticipants(id, ids);
}

/**
 * 入力を保存形式に整える。
 * - 終日の日時は shared/calendar.ts の規則（クライアントの楽観的更新も同じ規則を使う）
 * - rrule: 正規形にする
 */
function normalizeInput(input: CreateEventInput) {
  const { startsAt, endsAt } = normalizeInstants(input.allDay, input.startsAt, input.endsAt);
  return {
    kind: input.kind,
    title: input.title,
    allDay: input.allDay,
    startsAt,
    endsAt,
    location: input.location,
    note: input.note,
    rrule: input.rrule ? normalizeRRule(input.rrule) : null,
    remindStartMinutes: input.remindStartMinutes,
    remindEndMinutes: input.remindEndMinutes,
  };
}
