import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import {
  CARE_TYPE_LABELS,
  CARE_TYPES,
  type CareType,
} from '../../../../shared/validation/lemon.ts';
import { ALL, optionOrUndefined } from '../../../lib/search.ts';
import { DateRangeFilter } from '../../../lib/ui/DateRangeFilter.tsx';
import { FilterPanel } from '../../../lib/ui/FilterPanel.tsx';
import type { LemonFilters, LemonFiltersPatch } from '../search.ts';

type Props = {
  open: boolean;
  filters: LemonFilters;
  onChange: (next: LemonFiltersPatch) => void;
};

/**
 * レモンの詳細な検索（AppBar の絞り込みボタンで開く）。項目と実施日の範囲で履歴を絞り込む。
 * 1 件が複数の項目を持つので、選んだ項目を含む記録が残る。
 * メモのキーワードは AppBar の検索窓が持つのでここには無い。
 * 「検索」ボタンは置かず、入力するたびに絞り込む。絞り込みはサーバーが掛けるので（手元にあるのは読んだページだけ）、
 * 入力するたびに取り直し、届くまでは前の結果を出したままにする（`useScreenHistory`）。
 */
export function CareLogFilterForm({ open, filters, onChange }: Props) {
  return (
    <FilterPanel open={open}>
      <TextField
        label="種別"
        select
        size="small"
        value={filters.kind ?? ALL}
        onChange={(e) => onChange({ kind: optionOrUndefined<CareType>(e.target.value) })}
      >
        <MenuItem value={ALL}>すべて</MenuItem>
        {CARE_TYPES.map((t) => (
          <MenuItem key={t} value={t}>
            {CARE_TYPE_LABELS[t]}
          </MenuItem>
        ))}
      </TextField>
      <DateRangeFilter since={filters.since} until={filters.until} onChange={onChange} />
    </FilterPanel>
  );
}
