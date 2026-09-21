import { normalizeInstants } from '../../../shared/calendar.ts';
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
import * as repository from './repository.ts';
import type { EventRow, NewEventRow } from './schema.ts';

export { listItems } from './occurrences.ts';

export async function getEvent(id: string): Promise<EventMaster> {
  const row = await repository.findById(id);
  if (!row) throw new NotFoundError('見つかりません');
  return toMaster(row, await participantsOf(id));
}

export async function createEvent(input: CreateEventInput, userId: string): Promise<EventMaster> {
  const id = await repository.insert(
    { ...normalizeInput(input), createdBy: userId },
    input.participantIds,
  );
  await enqueueUpcoming();
  return getEvent(id);
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
    return getEvent(id);
  }

  if (scope === 'following') {
    const splitAt = requireOccurrence(master, input.occurrenceStart);
    const newId = await repository.splitFollowing({
      masterId: id,
      masterRRule: withUntilBefore(master.rrule ?? '', splitAt),
      splitAt,
      newRow: { ...values, createdBy: userId },
      participantIds: input.participantIds,
    });
    return getEvent(newId);
  }

  await repository.update(id, values, input.participantIds);
  // 基準日時や繰り返しが変わると回の照合キー（元の発生日時）が意味を失うため、未完了の回は捨てる。完了した回は履歴として残す
  if (baseOf(values)?.getTime() !== baseOf(master)?.getTime() || values.rrule !== master.rrule) {
    await repository.deleteUncompletedOccurrences(id);
  }
  return getEvent(id);
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

async function findMaster(id: string): Promise<EventRow> {
  const row = await repository.findById(id);
  if (!row) throw new NotFoundError('見つかりません');
  return row;
}

async function participantsOf(id: string): Promise<string[]> {
  return (await repository.findParticipants([id])).map((p) => p.userId);
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
  master: EventRow,
  scope: RecurrenceScope,
  occurrenceStart: Date | undefined,
): RecurrenceScope {
  if (!master.rrule) return 'all';
  if (scope === 'following' && occurrenceStart?.getTime() === baseOf(master)?.getTime())
    return 'all';
  return scope;
}

/** 繰り返しの回の指定を検証する（ルール上に実在する発生の基準日時であること） */
function requireOccurrence(master: EventRow, value: Date | undefined): Date {
  if (!value) throw new ValidationError('occurrenceStart が必要です');
  if (!occurrenceExists(master, value)) throw new ValidationError('その回は存在しません');
  return value;
}

/**
 * 繰り返しの回を実体化する（無ければ繰り返し元の複製に values を重ねて作り、あれば values だけを当てる）。
 * 参加者は、指定があれば置き換え、新しく作るときは繰り返し元から複製する。
 */
async function materialize(
  master: EventRow,
  occurrenceStart: Date,
  values: Partial<NewEventRow>,
  participantIds: string[] | undefined,
  userId: string,
): Promise<void> {
  const { id: _id, createdAt: _c, updatedAt: _u, ...copy } = master;
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
  const ids = participantIds ?? (inserted ? await participantsOf(master.id) : undefined);
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
