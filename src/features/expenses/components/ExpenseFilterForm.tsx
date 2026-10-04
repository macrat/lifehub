import TextField from '@mui/material/TextField';
import { numberOrUndefined } from '../../../lib/search.ts';
import { DateRangeFilter } from '../../../lib/ui/DateRangeFilter.tsx';
import { FilterPanel } from '../../../lib/ui/FilterPanel.tsx';
import { FilterSelect } from '../../../lib/ui/FilterSelect.tsx';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { partyFilterOptions } from '../parties.ts';
import type { ExpenseFilters, ExpenseFiltersPatch } from '../search.ts';

type Props = {
  open: boolean;
  filters: ExpenseFilters;
  onChange: (next: ExpenseFiltersPatch) => void;
};

/**
 * 立替の詳細な検索（AppBar の絞り込みボタンで開く）。金額の範囲・日付の範囲・To・From で履歴を絞り込む。
 * 内容のキーワードは AppBar の検索窓が持つのでここには無い。
 * 「検索」ボタンは置かず、入力するたびに絞り込む。絞り込みはサーバーが掛けるので（手元にあるのは読んだページだけ）、
 * 入力するたびに取り直し、届くまでは前の結果を出したままにする（`useScreenHistory`）。
 */
export function ExpenseFilterForm({ open, filters, onChange }: Props) {
  const { users, label } = useUserLabels();
  const parties = partyFilterOptions(users, label);
  return (
    <FilterPanel open={open}>
      <TextField
        label="最小金額"
        type="number"
        size="small"
        value={filters.min ?? ''}
        onChange={(e) => onChange({ min: numberOrUndefined(e.target.value) })}
        slotProps={{ htmlInput: { min: 0, inputMode: 'numeric' } }}
      />
      <TextField
        label="最大金額"
        type="number"
        size="small"
        value={filters.max ?? ''}
        onChange={(e) => onChange({ max: numberOrUndefined(e.target.value) })}
        slotProps={{ htmlInput: { min: 0, inputMode: 'numeric' } }}
      />
      <DateRangeFilter since={filters.since} until={filters.until} onChange={onChange} />
      {/* フォームと同じく To（貸方）を先、From（借方）を後に並べる */}
      <FilterSelect
        label="To"
        value={filters.to}
        options={parties}
        onChange={(to) => onChange({ to })}
      />
      <FilterSelect
        label="From"
        value={filters.from}
        options={parties}
        onChange={(from) => onChange({ from })}
      />
    </FilterPanel>
  );
}
