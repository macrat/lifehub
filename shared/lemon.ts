import { diffDays, toDateString } from './date.ts';
import { type CareType, TRACKED_CARE_TYPES } from './validation/lemon.ts';

/**
 * レモンの世話の記録と、そこから導かれる種別ごとの状態。
 * サーバーの一覧・状態と、クライアントの楽観的更新が同じ規則を使うため、共通に置く。
 */

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

/**
 * 種別ごとの最終実施日時から状態を導く。規則はここ 1 か所だけに置く。
 * サーバーは SQL で種別ごとの最新だけを読んでこれに渡し（全行を読まずに済む）、
 * クライアントは手元の記録から最新を選んで渡すので、両者の答えは必ず一致する。
 */
export function careStatusesOf(lastDoneAt: Partial<Record<CareType, string>>, now: Date) {
  const todayDate = toDateString(now);
  return TRACKED_CARE_TYPES.map((careType) => {
    const last = lastDoneAt[careType] ?? null;
    return {
      careType,
      lastDoneAt: last,
      daysSince: last ? diffDays(toDateString(new Date(last)), todayDate) : null,
    };
  });
}

/** 記録（新しい順）から種別ごとの状態を導く。これからの予定（未来の記録）はまだ実施していないものとして扱う */
export function careStatuses(logs: CareLog[], now: Date): CareStatus[] {
  const lastDoneAt: Partial<Record<CareType, string>> = {};
  for (const log of logs) {
    if (new Date(log.doneAt).getTime() > now.getTime()) continue;
    lastDoneAt[log.careType] ??= log.doneAt;
  }
  return careStatusesOf(lastDoneAt, now);
}

/** 一覧の並び: 実施日時の新しい順。同じ日時は元の並び（登録の新しい順）のままにする */
export function sortCareLogs(logs: CareLog[]): CareLog[] {
  return [...logs].sort((a, b) => b.doneAt.localeCompare(a.doneAt));
}
