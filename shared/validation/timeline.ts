import { z } from 'zod';
import { dateStringSchema } from './common.ts';

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
 * タイムラインの 1 ページの取得（GET /api/timeline）。before を省くと最新のページ（24 時間先まで）、
 * 渡すとその日より前のページ（前のページの `nextCursor` をそのまま渡す）。
 */
export const timelineQuerySchema = timelineFilterSchema.extend({
  before: dateStringSchema.optional(),
});
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;
