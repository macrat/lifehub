import type { z } from 'zod';
import { timelineFilterSchema } from '../../../shared/validation/timeline.ts';
import { addSearchSchema } from '../../lib/add-search.ts';
import {
  type FilterConditions,
  type Filters,
  type FiltersPatch,
  filterSearchSchema,
} from '../../lib/search.ts';

/**
 * ホームの検索パラメータ。キーワード（q）に加えて、日付の範囲と自分以外のタスクを含めるかでタイムラインを絞り込む
 * （`filterSearchSchema`）。
 * 入力を開いて始めるしるし（`add`）も持つ。
 */
export const timelineSearchSchema = filterSearchSchema(addSearchSchema('/'), timelineFilterSchema);
type TimelineSearch = z.infer<typeof timelineSearchSchema>;

/** 画面の絞り込み（`useFilterSearch`） */
export type TimelineFilters = Filters<TimelineSearch>;
export type TimelineFiltersPatch = FiltersPatch<TimelineSearch>;

/**
 * 絞り込みボタンのバッジに数える条件。範囲は上下で 1 つ。自分以外のタスクを含めるかも、既定と違う状態を
 * 開かずに気付けるよう数える
 */
export const TIMELINE_FILTER_CONDITIONS: FilterConditions<TimelineSearch> = [
  ['since', 'until'],
  ['includeOthersTasks'],
];
