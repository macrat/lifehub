import { arrayContains, arrayOverlaps, desc, gte, lte, or, type SQL, sql } from 'drizzle-orm';
import { TIME_ZONE } from '../../../shared/constants.ts';
import {
  CARE_TYPE_LABELS,
  CARE_TYPES,
  type CareLogFilter,
  type CareLogListQuery,
  type CareType,
} from '../../../shared/validation/lemon.ts';
import { db } from '../../lib/db/client.ts';
import { findHistoryPage } from '../../lib/db/history.ts';
import {
  containsKeyword,
  deleteById,
  findById as findRowById,
  insertOnce,
  updateById,
} from '../../lib/db/query.ts';
import { timelineQueries } from '../../lib/db/timeline.ts';
import { type LemonCareLogRow, lemonCareLogs } from './schema.ts';

/** 実施日時の JST の暦日（date）。ページの区切りと日付の範囲の絞り込みに使う */
const doneOn = sql`(${lemonCareLogs.doneAt} AT TIME ZONE ${TIME_ZONE})::date`;

/** 記録の 1 ページ（`findHistoryPage`）。日は実施日時の JST の暦日 */
export function findPage({ before, ...filter }: CareLogListQuery) {
  return findHistoryPage({
    table: lemonCareLogs,
    day: doneOn,
    order: [lemonCareLogs.doneAt, lemonCareLogs.createdAt, lemonCareLogs.id],
    conditions: filterConditions(filter),
    before,
  });
}

/** 絞り込みの条件。範囲は両端を含む。キーワードはメモの部分一致 */
function filterConditions(f: CareLogFilter): (SQL | undefined)[] {
  return [
    containsKeyword(lemonCareLogs.note, f.q),
    f.kind !== undefined ? arrayContains(lemonCareLogs.careTypes, [f.kind]) : undefined,
    f.since !== undefined ? gte(doneOn, f.since) : undefined,
    f.until !== undefined ? lte(doneOn, f.until) : undefined,
  ];
}

/**
 * タイムラインの検索の条件: メモの部分一致か、名前にキーワードを含む項目（「水」なら葉水・水やり）を含む記録。
 * タイムラインでは記録の名前が項目なので、項目の名前でも見つかるようにする。空のキーワードは条件にしない
 */
function timelineKeyword(q: string | undefined): SQL | undefined {
  const keyword = q?.trim().toLowerCase();
  if (!keyword) return undefined;
  const careTypes = CARE_TYPES.filter((t) => CARE_TYPE_LABELS[t].toLowerCase().includes(keyword));
  return or(
    containsKeyword(lemonCareLogs.note, keyword),
    careTypes.length > 0 ? arrayOverlaps(lemonCareLogs.careTypes, careTypes) : undefined,
  );
}

/** タイムラインの問い合わせ。置く日時は実施日時 */
export const timeline = timelineQueries({
  table: lemonCareLogs,
  at: lemonCareLogs.doneAt,
  keyword: timelineKeyword,
});

/**
 * 項目ごとの、いちばん新しい実施記録（未来の記録は「まだ実施していない」ので除く）。
 * 状態はこれだけで決まるので、行を全部読まずに DB で 1 項目 1 行に絞る。
 * 1 件の記録が複数の項目を持つので、まず unnest で 1 項目 1 行にほどいてから DISTINCT ON で絞る。
 */
export async function findLatestByCareType(
  now: Date,
): Promise<{ careType: CareType; doneAt: Date }[]> {
  const unnested = db
    .select({
      careType: sql<CareType>`unnest(${lemonCareLogs.careTypes})`.as('care_type'),
      doneAt: lemonCareLogs.doneAt,
    })
    .from(lemonCareLogs)
    .where(lte(lemonCareLogs.doneAt, now))
    .as('care');

  return db
    .selectDistinctOn([unnested.careType], {
      careType: unnested.careType,
      doneAt: unnested.doneAt,
    })
    .from(unnested)
    .orderBy(unnested.careType, desc(unnested.doneAt));
}

/** 世話の記録を作る。同じ id で送り直されたら何も書かず、今の行を返す（`insertOnce`） */
export async function insert(row: {
  id: string;
  careTypes: CareType[];
  doneAt: Date;
  note: string | null;
  createdBy: string | null;
  apiKeyName: string | null;
}): Promise<LemonCareLogRow> {
  return insertOnce(lemonCareLogs, row);
}

export async function findById(id: string): Promise<LemonCareLogRow | undefined> {
  return findRowById(lemonCareLogs, id);
}

/** 全項目を置き換える。記録した人（createdBy）と入れた API キー（apiKeyName）は変えない */
export async function update(
  id: string,
  row: { careTypes: CareType[]; doneAt: Date; note: string | null },
): Promise<LemonCareLogRow | undefined> {
  return updateById(lemonCareLogs, id, row);
}

/** 消した行（無ければ undefined） */
export async function remove(id: string): Promise<LemonCareLogRow | undefined> {
  return deleteById(lemonCareLogs, id);
}
