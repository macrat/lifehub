import { newId } from '../../../shared/id.ts';
import { type CareLog, type CareStatus, careStatusesOf } from '../../../shared/lemon.ts';
import { careLogEntry } from '../../../shared/timeline.ts';
import type { HistoryPage } from '../../../shared/types.ts';
import type { CareLogInput, CareLogListQuery } from '../../../shared/validation/lemon.ts';
import { NotFoundError } from '../../lib/errors.ts';
import { recordTimelineSource } from '../../lib/timeline-source.ts';
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

/** id はクライアントが決めて送ってくる（`createCareLogRequestSchema`）。省略された呼び出し（MCP）はここで採番する */
export async function logCare(
  input: CareLogInput,
  source: CareLogSource,
  id: string = newId(),
): Promise<CareLog> {
  return toLog(
    await repository.insert({
      ...input,
      id,
      createdBy: 'userId' in source ? source.userId : null,
      apiKeyName: 'apiKeyName' in source ? source.apiKeyName : null,
    }),
  );
}

/** 全項目を置き換える。記録した人（createdBy）と入れた API キー（apiKeyName）は変えない */
export async function updateLog(id: string, input: CareLogInput): Promise<void> {
  if (!(await repository.update(id, input))) throw new NotFoundError('記録が見つかりません');
}

export async function deleteLog(id: string): Promise<void> {
  if (!(await repository.remove(id))) throw new NotFoundError('記録が見つかりません');
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
