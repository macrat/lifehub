import { normalizeInstants, toInputInstants } from '../../../shared/calendar.ts';
import { newId } from '../../../shared/id.ts';
import {
  type CompleteEventInput,
  type CreateEventInput,
  type EventPatch,
  eventRulesSchema,
  type OccurrenceTarget,
  type UpdateEventInput,
} from '../../../shared/validation/events.ts';
import { NotFoundError, ValidationError } from '../../lib/errors.ts';
import { applyPatch, checkRules } from '../../lib/patch.ts';
import { normalizeRRule, withUntilBefore } from '../../lib/recurrence/index.ts';
import { scheduleUpcoming } from '../notifications/service.ts';
import { baseOf, type EventMaster, occurrenceExists, shiftTo, toMaster } from './occurrences.ts';
import type { EventWithParticipants } from './repository.ts';
import * as repository from './repository.ts';
import type { NewEventRow } from './schema.ts';

export { listItems, listOccurrences } from './occurrences.ts';
export { timelineSource } from './timeline.ts';

export async function getEvent(id: string): Promise<EventMaster> {
  return toMaster(await findMaster(id));
}

/**
 * 一部の項目だけを変える更新（MCP。`applyPatch`）。patch で undefined の項目は今の値のまま。
 * 予定の開始だけが指定されたら、終了も同じだけずらす（`keepDuration`）。
 * 繰り返し元の読み出しは 1 回だけで、今の値の組み立てと更新の両方に使う。
 */
export async function patchEvent(
  id: string,
  target: OccurrenceTarget,
  patch: EventPatch,
  userId: string,
): Promise<EventMaster> {
  const master = await findMaster(id);
  const current = await currentInput(master, target);
  const merged = applyPatch(current, keepDuration(current, patch), eventRulesSchema);
  const result = await applyUpdate(master, { ...merged, ...target }, userId);
  scheduleUpcoming();
  return result;
}

/**
 * 予定の開始だけを変える部分更新は、長さを保って終了もずらす（予定を動かす）。
 * WHY: 「3 時からにして」を頼まれた LLM は終了を渡さないことが多く、終了を今のままにすると
 * 開始が終了を追い越して規則の誤りになるか、予定が意図せず伸び縮みする。
 * 終日と時刻ありを切り替えるときは長さの意味が変わる（日数と時間）ので、ずらさずに終了の指定を求める。
 */
function keepDuration(current: CreateEventInput, patch: EventPatch): EventPatch {
  const { startsAt, endsAt } = current;
  if (current.kind !== 'event' || !patch.startsAt || patch.endsAt !== undefined) return patch;
  if (!startsAt || !endsAt) return patch;
  if (patch.allDay !== undefined && patch.allDay !== current.allDay) {
    throw new ValidationError('終日と時刻ありを切り替えるときは、終了も指定してください');
  }
  const duration = endsAt.getTime() - startsAt.getTime();
  return { ...patch, endsAt: new Date(patch.startsAt.getTime() + duration) };
}

/**
 * 書き込みの対象の今の値を、作成・更新の入力の形で返す。
 * all は繰り返し元。this / following はその回（実体化されていればその行、無ければ繰り返し元をずらした値）。
 * 繰り返し元の値で埋めると、回の日時が最初の回の日時に戻ってしまう。
 */
async function currentInput(
  master: EventWithParticipants,
  input: OccurrenceTarget,
): Promise<CreateEventInput> {
  const target = resolveTarget(master, input);
  const row =
    target.scope === 'all'
      ? master
      : ((await repository.findOccurrence(master.id, target.occurrenceStart)) ?? {
          ...master,
          ...shiftTo(master, target.occurrenceStart),
        });
  return {
    kind: master.kind,
    title: row.title,
    allDay: row.allDay,
    ...toInputInstants(row.allDay, row.startsAt, row.endsAt),
    participantIds: row.participantIds,
    location: row.location,
    note: row.note,
    rrule: master.rrule,
    remindStartMinutes: row.remindStartMinutes,
    remindEndMinutes: row.remindEndMinutes,
  };
}

/**
 * id はクライアントが決めて送ってくる（`createEventRequestSchema`）。省略された呼び出し（MCP）はここで採番する。
 * 組み合わせの規則はここでも掛ける（`checkRules`）。API は入力のスキーマで確かめ済みだが、MCP は LLM の入力から
 * 組み立てた値を渡すので、どの経路の書き込みも規則を通るよう、書き込む所で確かめる（部分更新の `applyPatch` と同じ）。
 */
export async function createEvent(
  input: CreateEventInput,
  userId: string,
  id: string = newId(),
): Promise<EventMaster> {
  const values = normalizeInput(checkRules(input, eventRulesSchema));
  await repository.insert({ ...values, id, createdBy: userId }, input.participantIds);
  scheduleUpcoming();
  // 保存した値はすべて手元にあるので読み直さない（往復を 1 回減らす）
  return toMaster({ ...values, id, participantIds: input.participantIds, completedAt: null });
}

export async function updateEvent(
  id: string,
  input: UpdateEventInput,
  userId: string,
): Promise<void> {
  await applyUpdate(await findMaster(id), input, userId);
  scheduleUpcoming();
}

async function applyUpdate(
  master: EventWithParticipants,
  input: UpdateEventInput,
  userId: string,
): Promise<EventMaster> {
  const { id } = master;
  if (input.kind !== master.kind) throw new ValidationError('種別は変更できません');
  const target = resolveTarget(master, input);
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
  input: OccurrenceTarget,
  userId: string,
): Promise<void> {
  const master = await findMaster(id);
  const target = resolveTarget(master, input);

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

/** タスクの回を完了にする。完了日時は押した時刻（画面が送る。`completeEventRequestSchema`）で、無ければ今 */
export async function completeEvent(
  id: string,
  input: CompleteEventInput,
  userId: string,
  completedAt: Date = new Date(),
): Promise<void> {
  await setCompletedAt(id, input, completedAt, userId);
}

export async function uncompleteEvent(
  id: string,
  input: CompleteEventInput,
  userId: string,
): Promise<void> {
  await setCompletedAt(id, input, null, userId);
  // 完了していた間は日次 Cron が列挙しないので、当日の通知はここで予約し直さないと届かない
  scheduleUpcoming();
}

// ---- 内部 ----

async function findMaster(id: string): Promise<EventWithParticipants> {
  const row = await repository.findMasterById(id);
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
  // 単発は行そのもの。繰り返しのタスクで完了にするのは常に 1 つの回
  if (!master.rrule) {
    await repository.update(id, { completedAt });
    return;
  }
  const { occurrenceStart } = input;
  if (!occurrenceStart)
    throw new ValidationError('繰り返しのタスクは、完了にする回を指定してください');
  if (!occurrenceExists(master, occurrenceStart)) throw new ValidationError('その回は存在しません');
  await materialize(master, occurrenceStart, { completedAt }, undefined, userId);
}

/**
 * 操作の対象。繰り返しの回を指す操作（this / following）は、繰り返しのルールと
 * ルール上に実在する回の基準日時を必ず持つ（実在しなければここで ValidationError にする）ので、
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
  target: OccurrenceTarget,
): Target {
  const { rrule } = master;
  if (!rrule || target.scope === 'all') return { scope: 'all' };
  const { scope, occurrenceStart } = target;
  if (scope === 'following' && occurrenceStart.getTime() === baseOf(master)?.getTime())
    return { scope: 'all' };
  if (!occurrenceExists(master, occurrenceStart)) throw new ValidationError('その回は存在しません');
  return { scope, rrule, occurrenceStart };
}

/**
 * 繰り返しの回を実体化する（無ければ繰り返し元の複製に values を重ねて作り、あれば values だけを当てる）。
 * 参加者は、指定があれば置き換え、新しく作るときは繰り返し元から複製する（`repository.materializeOccurrence`）。
 */
async function materialize(
  master: EventWithParticipants,
  occurrenceStart: Date,
  values: Partial<NewEventRow>,
  participantIds: string[] | undefined,
  userId: string,
): Promise<void> {
  const { id: _id, createdAt: _c, updatedAt: _u, participantIds: _p, ...copy } = master;
  await repository.materializeOccurrence(
    {
      ...copy,
      ...shiftTo(master, occurrenceStart),
      rrule: null,
      createdBy: userId,
      ...values,
      seriesId: master.id,
      occurrenceStart,
    },
    values,
    participantIds,
  );
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
