import { DateRangeFilter } from '../../../lib/ui/DateRangeFilter.tsx';
import { FilterPanel } from '../../../lib/ui/FilterPanel.tsx';
import type { TimelineFilters, TimelineFiltersPatch } from '../search.ts';

type Props = {
  open: boolean;
  filters: TimelineFilters;
  onChange: (next: TimelineFiltersPatch) => void;
};

/**
 * タイムラインの詳細な検索（AppBar の絞り込みボタンで開く）。記録の日付の範囲で絞り込む。
 * キーワードは AppBar の検索窓が持つのでここには無い。「検索」ボタンは置かず、入力するたびに絞り込む。
 */
export function TimelineFilterForm({ open, filters, onChange }: Props) {
  return (
    <FilterPanel open={open}>
      <DateRangeFilter since={filters.since} until={filters.until} onChange={onChange} />
    </FilterPanel>
  );
}
