import type { z } from 'zod';
import { careLogFilterSchema } from '../../../shared/validation/lemon.ts';
import { type Filters, type FiltersPatch, keywordSearchSchema } from '../../lib/search.ts';
import { addSearchSchema } from '../add/shortcut.ts';

/**
 * レモンの検索パラメータ。キーワード（q）に加えて、項目と実施日の範囲で絞り込む。
 * 絞り込みは URL に持つので、再読み込みや共有で同じ絞り込みに戻る。
 * 絞り込みの規則は API と同じもの（`careLogFilterSchema`）で、そのままサーバーに渡して絞り込ませる。
 */
export const lemonSearchSchema = keywordSearchSchema.extend({
  /** 記録の入力を開いて始めるしるし（`src/features/add/shortcut.ts`）。絞り込みではない */
  add: addSearchSchema('lemon'),
  ...careLogFilterSchema.omit({ q: true }).shape,
});
export type LemonSearch = z.infer<typeof lemonSearchSchema>;

/** 画面の絞り込み（`useFilterSearch`） */
export type LemonFilters = Filters<LemonSearch>;
export type LemonFiltersPatch = FiltersPatch<LemonSearch>;

/** 効いている絞り込みの数。範囲は上下で 1 つと数える（バッジの数字が入力欄の数ではなく条件の数になる） */
export function countActiveFilters(search: LemonSearch): number {
  return [
    search.kind !== undefined,
    search.since !== undefined || search.until !== undefined,
  ].filter(Boolean).length;
}
