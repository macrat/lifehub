import { diffDays, toDateString } from './date.ts';
import { CARE_TYPE_LABELS, CARE_TYPES, type CareType } from './validation/lemon.ts';

/**
 * レモンの世話の記録と、そこから導かれる項目ごとの状態。
 * サーバーの一覧・状態と、クライアントの楽観的更新が同じ規則を使うため、共通に置く。
 */

export type CareLog = {
  id: string;
  /** その 1 回でやったこと。空なら項目に結び付かない記録（メモ） */
  careTypes: CareType[];
  doneAt: string;
  note: string | null;
  /** 記録した人。API キーで入れた記録は誰が記録したか分からないので null */
  createdBy: string | null;
  /** API キーで入れた記録の、そのキーの名前（記録した時点のもの）。画面・MCP から入れた記録は null */
  apiKeyName: string | null;
};

/** 記録の名前。やったことが 1 つも無い記録はメモそのものなので、そう名乗る */
export function careLogTitle(careTypes: CareType[]): string {
  return careTypes.length === 0 ? 'メモ' : careTypes.map((t) => CARE_TYPE_LABELS[t]).join('・');
}

/** 項目ごとの最終実施日時と経過日数（JST の暦日差）。未実施なら null */
export type CareStatus = {
  careType: CareType;
  lastDoneAt: string | null;
  daysSince: number | null;
};

/**
 * 項目ごとの最終実施日時から状態を導く。規則はここ 1 か所だけに置く。
 * サーバーは SQL で項目ごとの最新だけを読んでこれに渡し（全行を読まずに済む）、
 * クライアントは手元の記録から最新を選んで渡すので、両者の答えは必ず一致する。
 */
export function careStatusesOf(lastDoneAt: Partial<Record<CareType, string>>, now: Date) {
  const todayDate = toDateString(now);
  return CARE_TYPES.map((careType) => {
    const last = lastDoneAt[careType] ?? null;
    return {
      careType,
      lastDoneAt: last,
      daysSince: last ? diffDays(toDateString(new Date(last)), todayDate) : null,
    };
  });
}

/**
 * 記録（並びは問わない）から項目ごとの状態を導く。これからの予定（未来の記録）はまだ実施していないものとして扱う。
 * 項目ごとの最新は、記録の日時を比べて選ぶ（ISO 8601 の UTC なので文字列のまま比べられる）
 */
export function careStatuses(logs: CareLog[], now: Date): CareStatus[] {
  const lastDoneAt: Partial<Record<CareType, string>> = {};
  for (const log of logs) {
    if (new Date(log.doneAt).getTime() > now.getTime()) continue;
    for (const careType of log.careTypes) {
      if ((lastDoneAt[careType] ?? '') < log.doneAt) lastDoneAt[careType] = log.doneAt;
    }
  }
  return careStatusesOf(lastDoneAt, now);
}

/**
 * 一覧の並び: 実施日時の古い順（アプリの一覧はどれも上が古く下が新しい）。同じ日時は元の並びのまま。
 * サーバーのページ（`findPage`）も同じ並びで返す
 */
export function sortCareLogs(logs: CareLog[]): CareLog[] {
  return [...logs].sort((a, b) => a.doneAt.localeCompare(b.doneAt));
}
