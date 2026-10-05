import {
  type EventMaster,
  normalizeInstants,
  type WrittenEvent,
} from '../../../shared/calendar.ts';
import { newId } from '../../../shared/id.ts';
import {
  type CompleteEventInput,
  type CreateEventInput,
  type EventPatch,
  type EventValues,
  eventRulesSchema,
  type OccurrenceTarget,
  type UpdateEventInput,
} from '../../../shared/validation/events.ts';
import { ValidationError } from '../../lib/errors.ts';
import { checkRules } from '../../lib/patch.ts';
import { normalizeRRule, withUntilBefore } from '../../lib/recurrence/index.ts';
import { publishChanged } from '../mcp-events/service.ts';
import { notifyChanged, scheduleUpcoming } from '../notifications/service.ts';
import { occurrenceExists, toMaster } from './occurrences.ts';
import { patchedInput } from './patch.ts';
import type { EventWithParticipants } from './repository.ts';
import * as repository from './repository.ts';
import { findMaster, materialize, occurrenceOf, resolveTarget, writtenOf } from './targets.ts';

export { listItems, listOccurrences } from './occurrences.ts';
export { timelineSource } from './timeline.ts';

/**
 * 一部の項目だけを変える更新（MCP）。重ねる規則は `patch.ts`。
 * 繰り返し元の読み出しは 1 回だけで、今の値の組み立てと更新の両方に使う。
 */
export async function patchEvent(
  id: string,
  target: OccurrenceTarget,
  patch: EventPatch,
  userId: string,
): Promise<WrittenEvent> {
  const master = await findMaster(id);
  const merged = await patchedInput(master, target, patch);
  return writeUpdate(master, { ...merged, ...target }, userId);
}

export async function getEvent(id: string): Promise<EventMaster> {
  return toMaster(await findMaster(id));
}

/**
 * id はクライアントが決めて送ってくる（`createEventRequestSchema`）。省略された呼び出し（MCP）はここで採番する。
 * 形と組み合わせの規則はここでも掛ける（`checkRules`）。API は入力のスキーマで確かめ済みだが、MCP は LLM の入力から
 * 組み立てた平らな値を渡すので、どの経路の書き込みも規則を通るよう、書き込む所で確かめて種別の形にする
 * （部分更新の `applyPatch` と同じ）。
 */
export async function createEvent(
  input: EventValues,
  userId: string,
  id: string = newId(),
): Promise<EventMaster> {
  const values = normalizeInput(checkRules(input, eventRulesSchema));
  const created = writtenOf(
    await repository.insert({ ...values, id, createdBy: userId }, input.participantIds),
  );
  scheduleUpcoming();
  notifyChanged(created, 'added', userId);
  publishChanged({ type: 'event', record: created }, 'added', { userId });
  return created;
}

export async function updateEvent(
  id: string,
  input: EventValues & OccurrenceTarget,
  userId: string,
): Promise<void> {
  // 回の指定（scope・occurrenceStart）は入力のまま、項目は規則を通した種別の形にする
  await writeUpdate(
    await findMaster(id),
    { ...input, ...checkRules(input, eventRulesSchema) },
    userId,
  );
}

/** 書き換え、通知を予約し直し、直したことを MCP Events で知らせる。書いた後の予定・タスクを返す */
async function writeUpdate(
  master: EventWithParticipants,
  input: UpdateEventInput,
  userId: string,
): Promise<WrittenEvent> {
  const written = await applyUpdate(master, input, userId);
  scheduleUpcoming();
  publishChanged({ type: 'event', record: written }, 'updated', { userId });
  return written;
}

async function applyUpdate(
  master: EventWithParticipants,
  input: UpdateEventInput,
  userId: string,
): Promise<WrittenEvent> {
  const { id } = master;
  const target = resolveTarget(master, input);
  const values = normalizeInput(input);
  const { participantIds } = input;
  const kindChanged = input.kind !== master.kind;

  if (target.scope === 'this') {
    // 回の種別は繰り返し元のもの（展開は繰り返し元の種別で予定・タスクの規則を選ぶ）なので、回だけは変えられない
    if (kindChanged) throw new ValidationError('繰り返しの 1 回だけの種別は変更できません');
    // 実体化された回は繰り返さない（繰り返しは元の行だけが持つ）
    const { completedAt } = await materialize(
      master,
      target.occurrenceStart,
      { ...values, rrule: null, cancelled: false },
      participantIds,
      userId,
    );
    // 一覧が回を出すときと同じく、id と繰り返しは繰り返し元のもの（`buildOccurrence`）
    return {
      ...toMaster({ ...values, id, rrule: master.rrule, participantIds, completedAt }),
      occurrenceStart: target.occurrenceStart.toISOString(),
    };
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
    return writtenOf({ ...values, id: splitId, participantIds, completedAt: null });
  }

  // 種別を変えると完了は意味を失う（予定は完了を持てない）ので外す。変えないときは完了に触らない
  // （同時に押された完了を、読んだ時点の値で上書きしない）
  const completedAt = kindChanged ? null : master.completedAt;
  await repository.update(id, kindChanged ? { ...values, completedAt } : values, {
    participantIds,
    dropOccurrences: occurrencesToDrop(master, values),
  });
  return writtenOf({ ...values, id, participantIds, completedAt });
}

export async function deleteEvent(
  id: string,
  input: OccurrenceTarget,
  userId: string,
): Promise<void> {
  const master = await findMaster(id);
  const target = resolveTarget(master, input);
  const actor = { userId };

  if (target.scope === 'this') {
    const { occurrenceStart } = target;
    await materialize(master, occurrenceStart, { cancelled: true }, undefined, userId);
    // 取り消した回の行は残るので、届ける先があるときだけ読む
    const record = () => occurrenceOf(master, occurrenceStart);
    notifyChanged(record, 'deleted', userId);
    publishChanged({ type: 'event', record, scope: 'this' }, 'deleted', actor);
    return;
  }
  if (target.scope === 'following') {
    // 以降の回の行は消えるので、消す前に読んでおく
    const record = await occurrenceOf(master, target.occurrenceStart);
    await repository.truncateFollowing({
      masterId: id,
      masterRRule: withUntilBefore(target.rrule, target.occurrenceStart),
      splitAt: target.occurrenceStart,
    });
    notifyChanged(record, 'deleted', userId);
    publishChanged({ type: 'event', record, scope: 'following' }, 'deleted', actor);
    return;
  }
  await repository.remove(id);
  const record = writtenOf(master);
  notifyChanged(record, 'deleted', userId);
  publishChanged({ type: 'event', record }, 'deleted', actor);
}

/** タスクの回を完了にする。完了日時は押した時刻（画面が送る。`completeEventRequestSchema`）で、無ければ今 */
export async function completeEvent(
  id: string,
  input: CompleteEventInput,
  userId: string,
  completedAt: Date = new Date(),
): Promise<void> {
  const record = await setCompletedAt(id, input, completedAt, userId);
  publishChanged({ type: 'event', record }, 'updated', { userId });
}

export async function uncompleteEvent(
  id: string,
  input: CompleteEventInput,
  userId: string,
): Promise<void> {
  const record = await setCompletedAt(id, input, null, userId);
  // 完了していた間は日次 Cron が列挙しないので、当日の通知はここで予約し直さないと届かない
  scheduleUpcoming();
  publishChanged({ type: 'event', record }, 'updated', { userId });
}

/**
 * 完了日時を変え、変えた後の予定・タスク（MCP Events で届ける形）を返す。
 * 繰り返しの回は、実体化した回の行が返るのは完了日時だけなので、届ける先があるときだけ読む関数で返す。
 */
async function setCompletedAt(
  id: string,
  input: CompleteEventInput,
  completedAt: Date | null,
  userId: string,
): Promise<WrittenEvent | (() => Promise<WrittenEvent>)> {
  const master = await findMaster(id);
  if (master.kind !== 'task') throw new ValidationError('予定は完了にできません');
  // 単発は行そのもの。繰り返しのタスクで完了にするのは常に 1 つの回
  if (!master.rrule) {
    await repository.update(id, { completedAt });
    return writtenOf({ ...master, completedAt });
  }
  const { occurrenceStart } = input;
  if (!occurrenceStart)
    throw new ValidationError('繰り返しのタスクは、完了にする回を指定してください');
  if (!occurrenceExists(master, occurrenceStart)) throw new ValidationError('その回は存在しません');
  await materialize(master, occurrenceStart, { completedAt }, undefined, userId);
  return () => occurrenceOf(master, occurrenceStart);
}

/**
 * 繰り返し元を「すべて」で書き換えたときに捨てる実体化された回。
 * - 種別が変わった: 完了した回も含めてすべて。回は繰り返し元の複製なので元の種別のままで、
 *   完了した回はタスクだったときの履歴。予定になった繰り返しには置けない（予定は完了を持てない）
 * - 基準日時か繰り返しのルールが変わった: 回の照合キー（元の発生日時）が意味を失うので未完了の回。
 *   完了した回は履歴として残す
 */
function occurrencesToDrop(
  master: EventWithParticipants,
  values: ReturnType<typeof normalizeInput>,
): 'all' | 'uncompleted' | undefined {
  if (values.kind !== master.kind) return 'all';
  const rebased =
    values.startsAt.getTime() !== master.startsAt.getTime() || values.rrule !== master.rrule;
  return rebased ? 'uncompleted' : undefined;
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
