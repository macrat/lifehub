import type { z } from 'zod';
import { careLogFilterSchema } from '../../../shared/validation/lemon.ts';
import { addSearchSchema } from '../../lib/add-search.ts';
import {
  type FilterConditions,
  type Filters,
  type FiltersPatch,
  filterSearchSchema,
} from '../../lib/search.ts';

/**
 * レモンの検索パラメータ。キーワード（q）に加えて、項目と実施日の範囲で絞り込む（`filterSearchSchema`）。
 * 記録の入力を開いて始めるしるし（`add`）も持つ。
 */
export const lemonSearchSchema = filterSearchSchema(addSearchSchema('/lemon'), careLogFilterSchema);
export type LemonSearch = z.infer<typeof lemonSearchSchema>;

/** 画面の絞り込み（`useFilterSearch`） */
export type LemonFilters = Filters<LemonSearch>;
export type LemonFiltersPatch = FiltersPatch<LemonSearch>;

/** 絞り込みボタンのバッジに数える条件。範囲は上下で 1 つ */
export const LEMON_FILTER_CONDITIONS: FilterConditions<LemonSearch> = [
  ['kind'],
  ['since', 'until'],
];
