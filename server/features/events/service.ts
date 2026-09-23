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

export { listItems, listOccurrences } from './occurrences.ts';

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
  return toMaster({ ...values, id, participantIds: input.participantIds, completedAt: null });
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
  const target = resolveTarget(master, input.scope, input.occurrenceStart);
  const values = normalizeInput(input);
  const { participantIds } = input;

  if (target.scope === 'this') {
    // 実体化された回は繰り返さない（繰り返しは元の行だけが持つ）
    await materialize(
      master,
      target.occurrenceStart,
      { ...values, rrule: null, cancelled: false },
      participantIds,
      userId,
    );
    // 変わったのは回の行で、繰り返し元は読んだままなので、それをそのまま返す
    return toMaster(master);
  }

  // ここから下は保存した値がすべて手元にあるので、読み直さずに応答を組み立てる（往復を 1 回減らす）
  if (target.scope === 'following') {
    const splitId = await repository.splitFollowing({
      masterId: id,
      masterRRule: withUntilBefore(target.rrule, target.occurrenceStart),
      splitAt: target.occurrenceStart,
      newRow: { ...values, createdBy: userId },
      participantIds,
    });
    return toMaster({ ...values, id: splitId, participantIds, completedAt: null });
  }

  await repository.update(id, values, {
    participantIds,
    dropUncompletedOccurrences:
      baseOf(values)?.getTime() !== baseOf(master)?.getTime() || values.rrule !== master.rrule,
  });
  // 完了状態は入力に無く保存でも変わらないので、保存前の値をそのまま使う
  return toMaster({ ...values, id, participantIds, completedAt: master.completedAt });
}

export async function deleteEvent(
  id: string,
  input: DeleteEventInput,
  userId: string,
): Promise<void> {
  const master = await findMaster(id);
  const target = resolveTarget(master, input.scope, input.occurrenceStart);

  if (target.scope === 'this') {
    await materialize(master, target.occurrenceStart, { cancelled: true }, undefined, userId);
    return;
  }
  if (target.scope === 'following') {
    await repository.truncateFollowing({
      masterId: id,
      masterRRule: withUntilBefore(target.rrule, target.occurrenceStart),
      splitAt: target.occurrenceStart,
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

async function setCompletedAt(
  id: string,
  input: CompleteEventInput,
  completedAt: Date | null,
  userId: string,
): Promise<void> {
  const master = await findMaster(id);
  if (master.kind !== 'task') throw new ValidationError('予定は完了にできません');
  // 繰り返しのタスクで完了にするのは常に 1 つの回
  const target = resolveTarget(master, 'this', input.occurrenceStart);
  if (target.scope === 'all') {
    await repository.update(id, { completedAt });
    return;
  }
  await materialize(master, target.occurrenceStart, { completedAt }, undefined, userId);
}

/**
 * 操作の対象。繰り返しの回を指す操作（this / following）は、繰り返しのルールと
 * ルール上に実在する回の基準日時を必ず持つ（無ければここで ValidationError にする）ので、
 * 呼び出し側は rrule が null かどうかを改めて確かめなくてよい。
 */
type Target =
  | { scope: 'all' }
  | { scope: 'this' | 'following'; rrule: string; occurrenceStart: Date };

/**
 * 指定された範囲を実際に行う操作に読み替え、回の指定を検証する。
 * - 単発は常に all（回が 1 つしかない）
 * - 先頭の発生に対する following は all と同じ（以降すべて = 全部）。先頭の基準日時は
 *   ルールに当てはまらないこともある（DTSTART が BYDAY に合わない）ので、実在の確認より先に見る
 */
function resolveTarget(
  master: { rrule: string | null; startsAt: Date | null; endsAt: Date | null },
  scope: RecurrenceScope,
  occurrenceStart: Date | undefined,
): Target {
  const { rrule } = master;
  if (!rrule || scope === 'all') return { scope: 'all' };
  if (scope === 'following' && occurrenceStart?.getTime() === baseOf(master)?.getTime())
    return { scope: 'all' };
  if (!occurrenceStart) throw new ValidationError('occurrenceStart が必要です');
  if (!occurrenceExists(master, occurrenceStart)) throw new ValidationError('その回は存在しません');
  return { scope, rrule, occurrenceStart };
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
