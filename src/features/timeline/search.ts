import type { z } from 'zod';
import { timelineFilterSchema } from '../../../shared/validation/timeline.ts';
import { addSearchSchema } from '../../lib/add-search.ts';
import { type Filters, type FiltersPatch, keywordSearchSchema } from '../../lib/search.ts';

/**
 * ホームの検索パラメータ。キーワード（q）に加えて、日付の範囲でタイムラインを絞り込む。
 * 絞り込みは URL に持つので、再読み込みや共有で同じ絞り込みに戻る。
 * 絞り込みの規則は API と同じもの（`timelineFilterSchema`）で、そのままサーバーに渡して絞り込ませる。
 */
export const timelineSearchSchema = keywordSearchSchema.extend({
  /** 入力を開いて始めるしるし（`src/lib/add-search.ts`）。絞り込みではない */
  add: addSearchSchema('/'),
  ...timelineFilterSchema.omit({ q: true }).shape,
});
export type TimelineSearch = z.infer<typeof timelineSearchSchema>;

/** 画面の絞り込み（`useFilterSearch`） */
export type TimelineFilters = Filters<TimelineSearch>;
export type TimelineFiltersPatch = FiltersPatch<TimelineSearch>;

/** 効いている絞り込みの数。範囲は上下で 1 つと数える（バッジの数字が入力欄の数ではなく条件の数になる） */
export function countActiveFilters(search: TimelineSearch): number {
  return search.since !== undefined || search.until !== undefined ? 1 : 0;
}
