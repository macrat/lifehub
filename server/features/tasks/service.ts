import { addDays, startOfDate, toDateString, today } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import type { RecurrenceScope } from '../../../shared/validation/events.ts';
import {
  type CreateTaskInput,
  type DeleteTaskInput,
  SINGLE_OCCURRENCE_KEY,
  type UpdateTaskInput,
} from '../../../shared/validation/tasks.ts';
import { NotFoundError, ValidationError } from '../../lib/errors.ts';
import { enqueueUpcoming } from '../../lib/notifications/service.ts';
import {
  expandOccurrences,
  InvalidRRuleError,
  iterateOccurrences,
  normalizeRRule,
  withUntilBefore,
} from '../../lib/recurrence/index.ts';
import * as repository from './repository.ts';
import type { TaskCompletionRow, TaskOverrideRow, TaskRow } from './schema.ts';

export type TaskMaster = {
  id: string;
  title: string;
  note: string | null;
  assigneeUserId: string | null;
  startsAt: string | null;
  dueAt: string | null;
  rrule: string | null;
  notifyAtStart: boolean;
  notifyAtDue: boolean;
};

/** 表示対象の 1 回の発生（表示規則を適用済み） */
export type TaskOccurrence = TaskMaster & {
  /** 単発なら 'single'、繰り返しなら基準日時の ISO 8601（UTC） */
  occurrenceKey: string;
  /** 表示位置（JST 暦日） */
  placementDate: DateString;
  completedAt: string | null;
  isOverdue: boolean;
  isRecurring: boolean;
  isModified: boolean;
};

/** 同時に表示する未完了の発生の上限（繰り返しタスク） */
const MAX_VISIBLE_UNCOMPLETED = 2;

export async function getTask(id: string): Promise<TaskMaster> {
  const row = await repository.findById(id);
  if (!row) throw new NotFoundError('タスクが見つかりません');
  return toMaster(row);
}

/**
 * [from, to]（両端含む JST 暦日）に表示位置を持つ発生を返す。
 *
 * 表示規則（docs/features/tasks.md）:
 * - 未完了で開始日時が未来 → 開始日時の日。未完了で開始が過去／今日／未設定 → 今日（完了まで繰り越し）
 * - 完了 → 完了した日
 * - 繰り返しは、キャンセルされていない未完了の発生のうち基準日時が最も早い 2 つだけを表示する。
 *   未完了の発生 N は発生 N+2 の基準日時が到来した時点で放棄される（保存せず計算で導く）。
 */
export async function listOccurrences(
  range: { from: DateString; to: DateString },
  now: Date = new Date(),
): Promise<TaskOccurrence[]> {
  const masters = await repository.findAll();
  const ids = masters.map((m) => m.id);
  const overrides = groupBy(await repository.findOverridesByTaskIds(ids), (r) => r.taskId);
  const completions = groupBy(await repository.findCompletionsByTaskIds(ids), (r) => r.taskId);
  const result: TaskOccurrence[] = [];
  for (const master of masters) {
    const all = expandMaster(
      master,
      overrides.get(master.id) ?? new Map(),
      completions.get(master.id) ?? new Map(),
      now,
      range,
    );
    result.push(...all.filter((o) => o.placementDate >= range.from && o.placementDate <= range.to));
  }
  return result.sort(compareOccurrences);
}

export async function createTask(input: CreateTaskInput, userId: string): Promise<TaskMaster> {
  const row = await repository.insert({ ...normalizeInput(input), createdBy: userId });
  await enqueueUpcoming();
  return toMaster(row);
}

export async function updateTask(
  id: string,
  input: UpdateTaskInput,
  userId: string,
): Promise<TaskMaster> {
  const result = await applyUpdate(id, input, userId);
  // 当日〜翌日に新たな通知が発生する場合はその場で予約する（重複は dedupe で防ぐ）
  await enqueueUpcoming();
  return result;
}

async function applyUpdate(
  id: string,
  input: UpdateTaskInput,
  userId: string,
): Promise<TaskMaster> {
  const master = await repository.findById(id);
  if (!master) throw new NotFoundError('タスクが見つかりません');
  const scope = effectiveScope(master, input.scope, input.occurrenceKey);

  if (scope === 'this') {
    const occurrenceKey = requireOccurrenceKey(input.occurrenceKey);
    assertOccurrenceExists(master, occurrenceKey);
    await repository.upsertOverride({
      taskId: id,
      occurrenceKey,
      cancelled: false,
      title: input.title,
      note: input.note,
      startsAt: input.startsAt,
      dueAt: input.dueAt,
      createdBy: userId,
    });
    return toMaster(master);
  }

  if (scope === 'following') {
    const splitKey = requireOccurrenceKey(input.occurrenceKey);
    assertOccurrenceExists(master, splitKey);
    const newId = await repository.splitFollowing({
      masterId: id,
      masterRRule: withUntilBefore(master.rrule ?? '', new Date(splitKey)),
      splitKey,
      newRow: { ...normalizeInput(input), createdBy: userId },
    });
    return getTask(newId);
  }

  const values = normalizeInput(input);
  const updated = await repository.update(id, values);
  if (!updated) throw new NotFoundError('タスクが見つかりません');
  // 基準日時や繰り返しが変わると例外の照合キー（基準日時）が意味を失うため捨てる。完了記録は履歴として残す
  if (baseOf(values)?.getTime() !== baseOf(master)?.getTime() || values.rrule !== master.rrule) {
    await repository.deleteOverrides(id);
  }
  return toMaster(updated);
}

export async function deleteTask(
  id: string,
  input: DeleteTaskInput,
  userId: string,
): Promise<void> {
  const master = await repository.findById(id);
  if (!master) throw new NotFoundError('タスクが見つかりません');
  const scope = effectiveScope(master, input.scope, input.occurrenceKey);

  if (scope === 'this') {
    const occurrenceKey = requireOccurrenceKey(input.occurrenceKey);
    assertOccurrenceExists(master, occurrenceKey);
    await repository.upsertOverride({
      taskId: id,
      occurrenceKey,
      cancelled: true,
      title: null,
      note: null,
      startsAt: null,
      dueAt: null,
      createdBy: userId,
    });
    return;
  }
  if (scope === 'following') {
    const splitKey = requireOccurrenceKey(input.occurrenceKey);
    assertOccurrenceExists(master, splitKey);
    await repository.truncateFollowing({
      masterId: id,
      masterRRule: withUntilBefore(master.rrule ?? '', new Date(splitKey)),
      splitKey,
    });
    return;
  }
  await repository.remove(id);
}

/** 発生を完了にする。完了日時は今。 */
export async function completeTask(
  id: string,
  occurrenceKey: string,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  const master = await repository.findById(id);
  if (!master) throw new NotFoundError('タスクが見つかりません');
  assertOccurrenceExists(master, occurrenceKey);
  await repository.upsertCompletion({ taskId: id, occurrenceKey, completedAt: now, userId });
}

export async function uncompleteTask(id: string, occurrenceKey: string): Promise<void> {
  const master = await repository.findById(id);
  if (!master) throw new NotFoundError('タスクが見つかりません');
  await repository.deleteCompletion(id, occurrenceKey);
}

// ---- 内部 ----

/** 繰り返しの基準日時（DTSTART）: startsAt、無ければ dueAt */
function baseOf(row: { startsAt: Date | null; dueAt: Date | null }): Date | null {
  return row.startsAt ?? row.dueAt;
}

function effectiveScope(
  master: TaskRow,
  scope: RecurrenceScope,
  occurrenceKey: string | undefined,
): RecurrenceScope {
  if (!master.rrule) return 'all';
  if (scope === 'following' && occurrenceKey === baseOf(master)?.toISOString()) return 'all';
  return scope;
}

function requireOccurrenceKey(value: string | undefined): string {
  if (!value) throw new ValidationError('occurrenceKey が必要です');
  return value;
}

/** occurrenceKey が実在する発生を指すか検証する（単発は 'single'、繰り返しはルール上の発生の基準日時） */
function assertOccurrenceExists(master: TaskRow, occurrenceKey: string): void {
  if (!master.rrule) {
    if (occurrenceKey !== SINGLE_OCCURRENCE_KEY) {
      throw new ValidationError('単発のタスクの occurrenceKey は single です');
    }
    return;
  }
  const base = baseOf(master);
  const at = new Date(occurrenceKey);
  if (!base || Number.isNaN(at.getTime()) || at.toISOString() !== occurrenceKey) {
    throw new ValidationError('occurrenceKey の形式が正しくありません');
  }
  const hits = expandOccurrences({
    rrule: master.rrule,
    dtstart: base,
    from: at,
    to: new Date(at.getTime() + 1000),
  });
  if (hits.length === 0) throw new ValidationError('その回は存在しません');
}

function normalizeInput(input: CreateTaskInput) {
  let rrule: string | null = null;
  if (input.rrule) {
    try {
      rrule = normalizeRRule(input.rrule);
    } catch (error) {
      if (error instanceof InvalidRRuleError) throw new ValidationError(error.message);
      throw error;
    }
  }
  return {
    title: input.title,
    note: input.note,
    assigneeUserId: input.assigneeUserId,
    startsAt: input.startsAt,
    dueAt: input.dueAt,
    rrule,
    notifyAtStart: input.notifyAtStart,
    notifyAtDue: input.notifyAtDue,
  };
}

function toMaster(row: TaskRow): TaskMaster {
  return {
    id: row.id,
    title: row.title,
    note: row.note,
    assigneeUserId: row.assigneeUserId,
    startsAt: row.startsAt?.toISOString() ?? null,
    dueAt: row.dueAt?.toISOString() ?? null,
    rrule: row.rrule,
    notifyAtStart: row.notifyAtStart,
    notifyAtDue: row.notifyAtDue,
  };
}

function groupBy<T extends { occurrenceKey: string }>(
  rows: T[],
  key: (row: T) => string,
): Map<string, Map<string, T>> {
  const map = new Map<string, Map<string, T>>();
  for (const row of rows) {
    const inner = map.get(key(row)) ?? new Map<string, T>();
    inner.set(row.occurrenceKey, row);
    map.set(key(row), inner);
  }
  return map;
}

type OccurrenceInput = {
  occurrenceKey: string;
  startsAt: Date | null;
  dueAt: Date | null;
  override: TaskOverrideRow | undefined;
  completion: TaskCompletionRow | undefined;
};

function buildOccurrence(master: TaskRow, input: OccurrenceInput, now: Date): TaskOccurrence {
  const startsAt = input.override?.startsAt ?? input.startsAt;
  const dueAt = input.override?.dueAt ?? input.dueAt;
  const completedAt = input.completion?.completedAt ?? null;
  const todayDate = today(now);
  let placementDate: DateString;
  if (completedAt) {
    placementDate = toDateString(completedAt);
  } else if (startsAt && toDateString(startsAt) > todayDate) {
    placementDate = toDateString(startsAt);
  } else {
    placementDate = todayDate;
  }
  return {
    ...toMaster(master),
    occurrenceKey: input.occurrenceKey,
    title: input.override?.title ?? master.title,
    note: input.override?.note ?? master.note,
    startsAt: startsAt?.toISOString() ?? null,
    dueAt: dueAt?.toISOString() ?? null,
    placementDate,
    completedAt: completedAt?.toISOString() ?? null,
    isOverdue: !completedAt && dueAt !== null && dueAt.getTime() < now.getTime(),
    isRecurring: master.rrule !== null,
    isModified: input.override !== undefined,
  };
}

function expandMaster(
  master: TaskRow,
  overrides: Map<string, TaskOverrideRow>,
  completions: Map<string, TaskCompletionRow>,
  now: Date,
  range: { from: DateString; to: DateString },
): TaskOccurrence[] {
  if (!master.rrule) {
    return [
      buildOccurrence(
        master,
        {
          occurrenceKey: SINGLE_OCCURRENCE_KEY,
          startsAt: master.startsAt,
          dueAt: master.dueAt,
          override: undefined,
          completion: completions.get(SINGLE_OCCURRENCE_KEY),
        },
        now,
      ),
    ];
  }

  const base = baseOf(master);
  if (!base) return [];
  const dueOffset =
    master.startsAt && master.dueAt ? master.dueAt.getTime() - master.startsAt.getTime() : null;
  const occurrenceAt = (at: Date): { startsAt: Date | null; dueAt: Date | null } => ({
    startsAt: master.startsAt ? at : null,
    dueAt: master.dueAt ? (dueOffset === null ? at : new Date(at.getTime() + dueOffset)) : null,
  });

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
  const result: TaskOccurrence[] = [];
  const emitted = new Set<string>();
  let visibleUncompleted = 0;
  for (let n = 0; visibleUncompleted < MAX_VISIBLE_UNCOMPLETED; n++) {
    const at = ensure(n);
    if (!at) break;
    // 範囲の終わりより先の発生は範囲内に表示されない（未完了の先頭 2 つはこれより前に決まっている）
    if (at.getTime() >= rangeEnd.getTime()) break;
    const occurrenceKey = at.toISOString();
    const override = overrides.get(occurrenceKey);
    const completion = completions.get(occurrenceKey);
    if (override?.cancelled) continue;
    if (completion) {
      emitted.add(occurrenceKey);
      result.push(
        buildOccurrence(master, { occurrenceKey, ...occurrenceAt(at), override, completion }, now),
      );
      continue;
    }
    const twoAhead = ensure(n + 2);
    const abandoned = twoAhead !== undefined && twoAhead.getTime() <= now.getTime();
    if (abandoned) continue;
    visibleUncompleted++;
    emitted.add(occurrenceKey);
    result.push(
      buildOccurrence(master, { occurrenceKey, ...occurrenceAt(at), override, completion }, now),
    );
  }

  // 走査の外で完了した回（走査の打ち切り後や、既に放棄された回の完了）も完了日に表示する
  for (const [occurrenceKey, completion] of completions) {
    if (emitted.has(occurrenceKey)) continue;
    const at = new Date(occurrenceKey);
    if (Number.isNaN(at.getTime())) continue;
    result.push(
      buildOccurrence(
        master,
        { occurrenceKey, ...occurrenceAt(at), override: overrides.get(occurrenceKey), completion },
        now,
      ),
    );
  }
  return result;
}

function compareOccurrences(a: TaskOccurrence, b: TaskOccurrence): number {
  if (a.placementDate !== b.placementDate) return a.placementDate < b.placementDate ? -1 : 1;
  // 同日内は期限が近い順、期限なしは後ろ
  if (a.dueAt !== b.dueAt) {
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    return a.dueAt.localeCompare(b.dueAt);
  }
  return (a.startsAt ?? '').localeCompare(b.startsAt ?? '');
}
