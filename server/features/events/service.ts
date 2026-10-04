import {
  normalizeInstants,
  switchedEnds,
  toInputInstants,
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
import { NotFoundError, ValidationError } from '../../lib/errors.ts';
import { applyPatch, checkRules } from '../../lib/patch.ts';
import { normalizeRRule, withUntilBefore } from '../../lib/recurrence/index.ts';
import { publishChanged } from '../mcp-events/service.ts';
import { scheduleUpcoming } from '../notifications/service.ts';
import { type EventMaster, occurrenceExists, shiftTo, toMaster } from './occurrences.ts';
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
 * 種別を変えるときは、今の値を切り替えた種別の値に直してから重ねる（`switchedKind`）。
 * 予定の開始だけが指定されたら、終了も同じだけずらす（`keepDuration`）。
 * 終日と時刻ありを切り替えるときは、日時を持つ端をすべて指定させる（`requireBothEnds`）。
 * 繰り返し元の読み出しは 1 回だけで、今の値の組み立てと更新の両方に使う。
 */
export async function patchEvent(
  id: string,
  target: OccurrenceTarget,
  patch: EventPatch,
  userId: string,
): Promise<WrittenEvent> {
  const master = await findMaster(id);
  const current = switchedKind(await currentInput(master, target), patch);
  requireBothEnds(current, patch);
  const merged = applyPatch(current, keepDuration(current, patch), eventRulesSchema);
  return writeUpdate(master, { ...merged, ...target }, userId);
}

/**
 * 種別を変える部分更新の、切り替えた後の今の値。終わりは画面の切り替えと同じ規則（`switchedEnds`。
 * patch に end があれば、後で重ねるそれになる）。開始は patch に渡されていればそれを引き継ぐ
 * （「このタスクを明日 10 時の予定にして」で、終了が 10 時の 1 時間後になるように）。
 */
function switchedKind(current: EventValues, patch: EventPatch): EventValues {
  const { kind } = patch;
  if (kind === undefined || kind === current.kind) return current;
  const allDay = patch.allDay ?? current.allDay;
  const startsAt = patch.startsAt ?? current.startsAt;
  return { ...current, allDay, startsAt, ...switchedEnds(kind, allDay, startsAt) };
}

/**
 * 終日と時刻ありを切り替える部分更新は、今の値が持つ日時（開始と、予定なら終了）をすべて指定させる。
 * WHY: 終日の日時は保存のときに 0:00 に丸める（`normalizeInstants`）ので、省いた端を今のまま残すと、
 * 「終了を日付にして」で開始の時刻が 0:00 に切り詰められるように、省いた項目が黙って変わる。
 */
function requireBothEnds(current: EventValues, patch: EventPatch): void {
  if (patch.allDay === undefined || patch.allDay === current.allDay) return;
  const omitted =
    patch.startsAt === undefined || (current.kind === 'event' && patch.endsAt === undefined);
  if (omitted) {
    throw new ValidationError(
      '終日と時刻ありを切り替えるときは、開始（予定なら終了も）を指定してください',
    );
  }
}

/**
 * 予定の開始だけを変える部分更新は、長さを保って終了もずらす（予定を動かす）。
 * WHY: 「3 時からにして」を頼まれた LLM は終了を渡さないことが多く、終了を今のままにすると
 * 開始が終了を追い越して規則の誤りになるか、予定が意図せず伸び縮みする。
 * 終日と時刻ありの切り替えでは両端が指定されている（`requireBothEnds`）ので、ここには来ない。
 */
function keepDuration(current: EventValues, patch: EventPatch): EventPatch {
  const { startsAt, endsAt } = current;
  // 終了を持つのは予定だけ（平らな値なので、終了の有無で絞る）
  if (!endsAt || !patch.startsAt || patch.endsAt !== undefined) return patch;
  const duration = endsAt.getTime() - startsAt.getTime();
  return { ...patch, endsAt: new Date(patch.startsAt.getTime() + duration) };
}

/**
 * 書き込みの対象の今の値を、作成・更新の入力の項目で返す（種別で分ける前の平らな値。分けるのは規則を掛ける所）。
 * all は繰り返し元。this / following はその回（実体化されていればその行、無ければ繰り返し元をずらした値）。
 * 繰り返し元の値で埋めると、回の日時が最初の回の日時に戻ってしまう。
 */
async function currentInput(
  master: EventWithParticipants,
  input: OccurrenceTarget,
): Promise<EventValues> {
  const target = resolveTarget(master, input);
  const row =
    target.scope === 'all' ? master : await occurrenceRowOf(master, target.occurrenceStart);
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
    publishChanged({ type: 'event', record, scope: 'following' }, 'deleted', actor);
    return;
  }
  await repository.remove(id);
  publishChanged({ type: 'event', record: writtenOf(master) }, 'deleted', actor);
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

/** 書いた行（回でないもの）を、書き込んだ予定・タスクの形にする */
function writtenOf(row: Parameters<typeof toMaster>[0]): WrittenEvent {
  return { ...toMaster(row), occurrenceStart: null };
}

/**
 * 繰り返しの回の今の値（MCP Events で届ける形）。実体化されていればその行、無ければ繰り返し元をずらした値で、
 * 一覧が回を出すときと同じく id と繰り返しは繰り返し元のもの（`buildOccurrence`）
 */
async function occurrenceOf(
  master: EventWithParticipants,
  occurrenceStart: Date,
): Promise<WrittenEvent> {
  const row = await occurrenceRowOf(master, occurrenceStart);
  return {
    ...toMaster({ ...row, id: master.id, rrule: master.rrule }),
    occurrenceStart: occurrenceStart.toISOString(),
  };
}

/** 繰り返しの回の行。実体化されていればその行、無ければ繰り返し元をその回へずらした値 */
async function occurrenceRowOf(master: EventWithParticipants, occurrenceStart: Date) {
  return (
    (await repository.findOccurrence(master.id, occurrenceStart)) ?? {
      ...master,
      ...shiftTo(master, occurrenceStart),
    }
  );
}

// ---- 内部 ----

async function findMaster(id: string): Promise<EventWithParticipants> {
  const row = await repository.findMasterById(id);
  if (!row) throw new NotFoundError('見つかりません');
  return row;
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
  master: { rrule: string | null; startsAt: Date },
  target: OccurrenceTarget,
): Target {
  const { rrule } = master;
  if (!rrule || target.scope === 'all') return { scope: 'all' };
  const { scope, occurrenceStart } = target;
  if (scope === 'following' && occurrenceStart.getTime() === master.startsAt.getTime())
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
): Promise<{ completedAt: Date | null }> {
  const { id: _id, createdAt: _c, updatedAt: _u, participantIds: _p, ...copy } = master;
  return repository.materializeOccurrence(
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
