import { z } from 'zod';
import { isFiltered } from '../search.ts';
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
  /**
   * 自分が参加者にいないタスクも出すか。既定（省略）は出さない: タスクはやることの一覧で、相手のやることは自分の手を動かさない。
   * 予定は相手のものでも出す（家の予定として知っておきたい）
   */
  includeOthersTasks: z.boolean().optional(),
});
export type TimelineFilter = z.infer<typeof timelineFilterSchema>;

/**
 * ピン止めしたメモをタイムラインの上に固定して出すか: 記録を絞り込んでいない（`isFiltered`）とき。
 * 自分以外のタスクを含めるか（`includeOthersTasks`）は出す記録の範囲を選ぶ設定で、探し物をしている状態ではないので見ない
 */
export function pinsOnTop({
  includeOthersTasks: _includeOthersTasks,
  ...filter
}: TimelineFilter): boolean {
  return !isFiltered(filter);
}

/** タイムラインの 1 ページの取得（`timeline.get`。`cursorShape`。最新のページは 24 時間先まで） */
export const timelineQuerySchema = timelineFilterSchema.extend(cursorShape);
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;
