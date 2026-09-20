import { diffDays, toDateString } from '../../../shared/date.ts';
import {
  type CareType,
  type CreateCareLogInput,
  TRACKED_CARE_TYPES,
} from '../../../shared/validation/lemon.ts';
import { NotFoundError } from '../../lib/errors.ts';
import * as repository from './repository.ts';
import type { LemonCareLogRow } from './schema.ts';

export type CareLog = {
  id: string;
  careType: CareType;
  doneAt: string;
  note: string | null;
  createdBy: string;
};

/** 種別ごとの最終実施日時と経過日数（JST の暦日差）。未実施なら null */
export type CareStatus = {
  careType: (typeof TRACKED_CARE_TYPES)[number];
  lastDoneAt: string | null;
  daysSince: number | null;
};

export async function listLogs(): Promise<CareLog[]> {
  return (await repository.findAll()).map(toLog);
}

export async function getStatus(now: Date = new Date()): Promise<CareStatus[]> {
  const logs = await repository.findAll();
  const todayDate = toDateString(now);
  return TRACKED_CARE_TYPES.map((careType) => {
    const last = logs.find((l) => l.careType === careType && l.doneAt.getTime() <= now.getTime());
    return {
      careType,
      lastDoneAt: last?.doneAt.toISOString() ?? null,
      daysSince: last ? diffDays(toDateString(last.doneAt), todayDate) : null,
    };
  });
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
