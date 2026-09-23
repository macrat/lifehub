import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { isDateString } from '../../../../shared/date.ts';
import type { DateString } from '../../../../shared/types.ts';
import { SHARED } from '../../../../shared/validation/expenses.ts';
import { ALL } from '../../../lib/search.ts';
import { FilterPanel } from '../../../lib/ui/FilterPanel.tsx';
import { useUserLabels } from '../../users/use-user-labels.ts';
import type { ExpenseFilters, ExpenseFiltersPatch } from '../search.ts';

type Props = {
  open: boolean;
  filters: ExpenseFilters;
  onChange: (next: ExpenseFiltersPatch) => void;
};

/**
 * 立替の詳細な検索（AppBar の絞り込みボタンで開く）。金額の範囲・日付の範囲・To・From で履歴を絞り込む。
 * 内容のキーワードは AppBar の検索窓が持つのでここには無い。
 * 「検索」ボタンは置かず、入力するたびに絞り込む（一覧は手元にあるので取り直しは起きない）。
 */
export function ExpenseFilterForm({ open, filters, onChange }: Props) {
  const { users } = useUserLabels();
  return (
    <FilterPanel open={open}>
      <TextField
        label="最小金額"
        type="number"
        size="small"
        value={filters.min ?? ''}
        onChange={(e) => onChange({ min: amountOrUndefined(e.target.value) })}
        slotProps={{ htmlInput: { min: 0, inputMode: 'numeric' } }}
      />
      <TextField
        label="最大金額"
        type="number"
        size="small"
        value={filters.max ?? ''}
        onChange={(e) => onChange({ max: amountOrUndefined(e.target.value) })}
        slotProps={{ htmlInput: { min: 0, inputMode: 'numeric' } }}
      />
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
      {/* フォームと同じく To（貸方）を先、From（借方）を後に並べる */}
      <TextField
        label="To"
        select
        size="small"
        value={filters.to ?? ALL}
        onChange={(e) => onChange({ to: userOrUndefined(e.target.value) })}
      >
        <MenuItem value={ALL}>すべて</MenuItem>
        <MenuItem value={SHARED}>共有</MenuItem>
        {users.map((u) => (
          <MenuItem key={u.id} value={u.id}>
            {u.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="From"
        select
        size="small"
        value={filters.from ?? ALL}
        onChange={(e) => onChange({ from: userOrUndefined(e.target.value) })}
      >
        <MenuItem value={ALL}>すべて</MenuItem>
        {users.map((u) => (
          <MenuItem key={u.id} value={u.id}>
            {u.name}
          </MenuItem>
        ))}
      </TextField>
    </FilterPanel>
  );
}

/** 空欄（消した）や数字にならない入力は、その項目の絞り込みをやめる */
function amountOrUndefined(value: string): number | undefined {
  const amount = Number(value);
  return value === '' || Number.isNaN(amount) ? undefined : amount;
}

/** date 入力は消すと空文字になり、打っている途中は日付にならない。どちらも絞り込みをやめる */
function dateOrUndefined(value: string): DateString | undefined {
  return isDateString(value) ? value : undefined;
}

/** 「すべて」は絞り込みをやめる（URL にも残さない） */
function userOrUndefined(value: string): string | undefined {
  return value === ALL ? undefined : value;
}
