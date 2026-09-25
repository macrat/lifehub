import TextField from '@mui/material/TextField';
import { dateOrUndefined } from '../../../lib/search.ts';
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
      <TextField
        label="開始日"
        type="date"
        size="small"
        value={filters.since ?? ''}
        onChange={(e) => onChange({ since: dateOrUndefined(e.target.value) })}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        label="終了日"
        type="date"
        size="small"
        value={filters.until ?? ''}
        onChange={(e) => onChange({ until: dateOrUndefined(e.target.value) })}
        slotProps={{ inputLabel: { shrink: true } }}
      />
    </FilterPanel>
  );
}
