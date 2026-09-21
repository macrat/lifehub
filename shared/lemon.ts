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

/** 記録（新しい順）から種別ごとの状態を導く。これからの予定（未来の記録）はまだ実施していないものとして扱う */
export function careStatuses(logs: CareLog[], now: Date): CareStatus[] {
  const todayDate = toDateString(now);
  return TRACKED_CARE_TYPES.map((careType) => {
    const last = logs.find(
      (log) => log.careType === careType && new Date(log.doneAt).getTime() <= now.getTime(),
    );
    return {
      careType,
      lastDoneAt: last?.doneAt ?? null,
      daysSince: last ? diffDays(toDateString(new Date(last.doneAt)), todayDate) : null,
    };
  });
}

/** 一覧の並び: 実施日時の新しい順。同じ日時は元の並び（登録の新しい順）のままにする */
export function sortCareLogs(logs: CareLog[]): CareLog[] {
  return [...logs].sort((a, b) => b.doneAt.localeCompare(a.doneAt));
}
