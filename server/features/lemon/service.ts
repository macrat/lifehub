import { newId } from '../../../shared/id.ts';
import { type CareLog, type CareStatus, careStatusesOf } from '../../../shared/lemon.ts';
import type { HistoryPage } from '../../../shared/types.ts';
import type { CareLogInput, CareLogListQuery } from '../../../shared/validation/lemon.ts';
import { NotFoundError } from '../../lib/errors.ts';
import type { InstantRange } from '../../lib/history.ts';
import * as repository from './repository.ts';
import type { LemonCareLogRow } from './schema.ts';

export type { CareLog, CareStatus } from '../../../shared/lemon.ts';

/**
 * 記録の 1 ページ（古い順）。全件を返さないのは、記録は増え続けるのに画面が見るのは新しいほうだけだから。
 * 古いほうは nextCursor を before に渡して続きを読む（`findHistoryPage`）。
 */
export async function listLogs(query: CareLogListQuery): Promise<HistoryPage<CareLog>> {
  const { items, nextCursor } = await repository.findPage(query);
  return { items: items.map(toLog), nextCursor };
}

/** タイムラインのページ分け: before より前の、新しいほうから limit 件の実施日時 */
export function recentTimelineInstants(
  before: Date,
  q: string | undefined,
  limit: number,
): Promise<Date[]> {
  return repository.findRecentTimelineInstants(before, q, limit);
}

/** タイムラインに並べる記録（実施日時が範囲の中のもの。キーワードはメモか項目の名前） */
export async function listForTimeline(
  range: InstantRange,
  q: string | undefined,
): Promise<CareLog[]> {
  return (await repository.findInTimelineRange(range, q)).map(toLog);
}

/** 項目ごとの状態（shared/lemon.ts の規則）。項目ごとの最新の記録だけを読んで導く */
export async function getStatus(now: Date = new Date()): Promise<CareStatus[]> {
  const latest = await repository.findLatestByCareType(now);
  return careStatusesOf(
    Object.fromEntries(latest.map((row) => [row.careType, row.doneAt.toISOString()])),
    now,
  );
}

/** id はクライアントが決めて送ってくる（`createCareLogRequestSchema`）。省略された呼び出し（MCP）はここで採番する */
export async function logCare(
  input: CareLogInput,
  userId: string,
  id: string = newId(),
): Promise<CareLog> {
  return toLog(await repository.insert({ ...input, id, createdBy: userId }));
}

/** 全項目を置き換える。記録した人（createdBy）は変えない */
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
  };
}
