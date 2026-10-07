import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import { DateRangeFilter } from '../../../lib/ui/DateRangeFilter.tsx';
import { FilterPanel } from '../../../lib/ui/FilterPanel.tsx';
import type { TimelineFilters, TimelineFiltersPatch } from '../search.ts';

type Props = {
  open: boolean;
  filters: TimelineFilters;
  onChange: (next: TimelineFiltersPatch) => void;
};

/**
 * タイムラインの詳細な検索（AppBar の絞り込みボタンで開く）。記録の日付の範囲と、自分以外のタスクを含めるかで絞り込む。
 * キーワードは AppBar の検索窓が持つのでここには無い。「検索」ボタンは置かず、入力するたびに絞り込む。
 * チェックを外した状態は既定なので URL に残さない（undefined にする）。
 */
export function TimelineFilterForm({ open, filters, onChange }: Props) {
  return (
    <FilterPanel open={open}>
      <DateRangeFilter since={filters.since} until={filters.until} onChange={onChange} />
      <FormControlLabel
        control={
          <Checkbox
            checked={filters.includeOthersTasks === true}
            onChange={(e) => onChange({ includeOthersTasks: e.target.checked || undefined })}
          />
        }
        label="自分以外のタスクも含める"
        sx={{ gridColumn: '1 / -1' }}
      />
    </FilterPanel>
  );
}
