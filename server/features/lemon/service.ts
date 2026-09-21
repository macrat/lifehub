import { type CareLog, type CareStatus, careStatusesOf } from '../../../shared/lemon.ts';
import type { CreateCareLogInput } from '../../../shared/validation/lemon.ts';
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

export async function logCare(input: CreateCareLogInput, userId: string): Promise<CareLog> {
  return toLog(await repository.insert({ ...input, createdBy: userId }));
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
