import { newId } from '../../../shared/id.ts';
import { type CareLog, type CareStatus, careStatusesOf } from '../../../shared/lemon.ts';
import { careLogEntry } from '../../../shared/timeline.ts';
import type { HistoryPage } from '../../../shared/types.ts';
import {
  type CareLogInput,
  type CareLogListQuery,
  careLogRulesSchema,
} from '../../../shared/validation/lemon.ts';
import { NotFoundError } from '../../lib/errors.ts';
import { applyPatch, checkRules } from '../../lib/patch.ts';
import { recordTimelineSource } from '../../lib/timeline-source.ts';
import { publishChanged } from '../mcp-events/service.ts';
import * as repository from './repository.ts';
import type { LemonCareLogRow } from './schema.ts';

/**
 * 記録の 1 ページ（古い順）。全件を返さないのは、記録は増え続けるのに画面が見るのは新しいほうだけだから。
 * 古いほうは nextCursor を before に渡して続きを読む（`findHistoryPage`）。
 */
export async function listLogs(query: CareLogListQuery): Promise<HistoryPage<CareLog>> {
  const { items, nextCursor } = await repository.findPage(query);
  return { items: items.map(toLog), nextCursor };
}

/** タイムラインに並べる記録（置く日時は実施日時。キーワードはメモか項目の名前） */
export const timelineSource = recordTimelineSource(repository.timeline, (row) =>
  careLogEntry(toLog(row)),
);

/** 項目ごとの状態（shared/lemon.ts の規則）。項目ごとの最新の記録だけを読んで導く */
export async function getStatus(now: Date = new Date()): Promise<CareStatus[]> {
  const latest = await repository.findLatestByCareType(now);
  return careStatusesOf(
    Object.fromEntries(latest.map((row) => [row.careType, row.doneAt.toISOString()])),
    now,
  );
}

/**
 * 記録がどこから入ったか。画面・MCP からなら記録した人、API キーからならそのキーの名前。
 * API キーで入れた記録は誰が記録したか分からない（キーを持つボタンは家の誰が押しても同じキーで送る）ので、
 * 人の代わりにキーの名前を残す
 */
export type CareLogSource = { userId: string } | { apiKeyName: string };

/**
 * id はクライアントが決めて送ってくる（`createCareLogRequestSchema`）。省略された呼び出し（MCP）はここで採番する。
 * 組み合わせの規則はここでも掛ける（`checkRules`）。API は入力のスキーマで確かめ済みだが、MCP は LLM の入力から
 * 組み立てた値を渡すので、どの経路の書き込みも規則を通るよう、書き込む所で確かめる（部分更新の `applyPatch` と同じ）。
 */
export async function logCare(
  input: CareLogInput,
  source: CareLogSource,
  id: string = newId(),
): Promise<CareLog> {
  const log = toLog(
    await repository.insert({
      ...checkRules(input, careLogRulesSchema),
      id,
      createdBy: 'userId' in source ? source.userId : null,
      apiKeyName: 'apiKeyName' in source ? source.apiKeyName : null,
    }),
  );
  publishChanged({ type: 'lemon', record: log }, 'added', source);
  return log;
}

/** 全項目を置き換える。記録した人（createdBy）と入れた API キー（apiKeyName）は変えない。actorId は直した人 */
export async function updateLog(id: string, input: CareLogInput, actorId: string): Promise<void> {
  const updated = await repository.update(id, input);
  if (!updated) throw new NotFoundError('記録が見つかりません');
  publishChanged({ type: 'lemon', record: toLog(updated) }, 'updated', { userId: actorId });
}

/**
 * 一部の項目だけを変える（MCP。`applyPatch`）。記録した人（createdBy）と入れた API キー（apiKeyName）は変えない。
 * actorId は直した人
 */
export async function patchLog(
  id: string,
  patch: Partial<CareLogInput>,
  actorId: string,
): Promise<CareLog> {
  const current = await repository.findById(id);
  if (!current) throw new NotFoundError('記録が見つかりません');
  // 項目の並びは、保存した値も入力（`careLogFieldsSchema`）も正規化済みなので、重ねたまま書ける
  const values = applyPatch(
    { careTypes: current.careTypes, doneAt: current.doneAt, note: current.note },
    patch,
    careLogRulesSchema,
  );
  const updated = await repository.update(id, values);
  if (!updated) throw new NotFoundError('記録が見つかりません');
  const log = toLog(updated);
  publishChanged({ type: 'lemon', record: log }, 'updated', { userId: actorId });
  return log;
}

/** actorId は消した人 */
export async function deleteLog(id: string, actorId: string): Promise<void> {
  const deleted = await repository.remove(id);
  if (!deleted) throw new NotFoundError('記録が見つかりません');
  publishChanged({ type: 'lemon', record: toLog(deleted) }, 'deleted', { userId: actorId });
}

function toLog(row: LemonCareLogRow): CareLog {
  return {
    id: row.id,
    careTypes: row.careTypes,
    doneAt: row.doneAt.toISOString(),
    note: row.note,
    createdBy: row.createdBy,
    apiKeyName: row.apiKeyName,
  };
}
