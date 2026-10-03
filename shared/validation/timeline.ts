import { z } from 'zod';
import { cursorShape, dateStringSchema } from './common.ts';

/**
 * タイムライン（ホーム）の絞り込み。範囲は両端を含み、省略した端は制限しない。
 * ホームの URL（`timelineSearchSchema`）と API（`timelineQuerySchema`）が同じ規則を使う。
 */
export const timelineFilterSchema = z.object({
  /** 記録の文字（予定・タスクのタイトルとメモ、立替の内容、レモンの項目とメモ、メモの本文）の部分一致 */
  q: z.string().optional(),
  /** 記録の日時の JST の暦日の最初・最後 */
  since: dateStringSchema.optional(),
  until: dateStringSchema.optional(),
});
export type TimelineFilter = z.infer<typeof timelineFilterSchema>;

/**
 * 絞り込んでいるか。絞り込んでいないときだけ、ピン止めしたメモをタイムラインから外して一番上に固定する。
 * 絞り込んでいるときはほかのメモと同じく、条件に合えば書いた時刻の位置に出す。サーバーと画面が同じ判定を使う。
 */
export function isFiltered({ q, since, until }: TimelineFilter): boolean {
  return Boolean(q) || since !== undefined || until !== undefined;
}

/** タイムラインの 1 ページの取得（GET /api/timeline。`cursorShape`。最新のページは 24 時間先まで） */
export const timelineQuerySchema = timelineFilterSchema.extend(cursorShape);
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;
