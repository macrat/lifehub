import { newId } from '../../../shared/id.ts';
import { type CareLog, type CareStatus, careStatusesOf } from '../../../shared/lemon.ts';
import type { CareLogInput } from '../../../shared/validation/lemon.ts';
import { NotFoundError } from '../../lib/errors.ts';
import * as repository from './repository.ts';
import type { LemonCareLogRow } from './schema.ts';

export type { CareLog, CareStatus } from '../../../shared/lemon.ts';

export async function listLogs(): Promise<CareLog[]> {
  return (await repository.findAll()).map(toLog);
}

/** 種別ごとの状態（shared/lemon.ts の規則）。種別ごとの最新の記録だけを読んで導く */
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
export async function updateLog(id: string, input: CareLogInput): Promise<CareLog> {
  const row = await repository.update(id, input);
  if (!row) throw new NotFoundError('記録が見つかりません');
  return toLog(row);
}

export async function deleteLog(id: string): Promise<void> {
  if (!(await repository.remove(id))) throw new NotFoundError('記録が見つかりません');
}

function toLog(row: LemonCareLogRow): CareLog {
  return {
    id: row.id,
    careType: row.careType,
    doneAt: row.doneAt.toISOString(),
    note: row.note,
    createdBy: row.createdBy,
  };
}
