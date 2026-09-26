import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { ALL, optionOrUndefined } from '../../../lib/search.ts';
import { DateRangeFilter } from '../../../lib/ui/DateRangeFilter.tsx';
import { FilterPanel } from '../../../lib/ui/FilterPanel.tsx';
import { useUserLabels } from '../../users/use-user-labels.ts';
import type { ListFilters, ListFiltersPatch } from '../search.ts';

type Props = {
  open: boolean;
  filters: ListFilters;
  onChange: (next: ListFiltersPatch) => void;
};

/**
 * リスト表示の詳細な絞り込み（期間・種別・参加者・完了状態）。キーワードは AppBar の検索窓が持つ。
 * 「すべて」と空欄は絞り込まない状態として URL に残さない（`optionOrUndefined`・`dateOrUndefined`）。
 */
export function ListFilterForm({ open, filters, onChange }: Props) {
  const { users } = useUserLabels();
  return (
    <FilterPanel open={open}>
      <DateRangeFilter
        since={filters.from}
        until={filters.to}
        onChange={(next) => onChange('since' in next ? { from: next.since } : { to: next.until })}
      />
      <TextField
        label="種別"
        select
        size="small"
        value={filters.kind ?? ALL}
        onChange={(e) => onChange({ kind: optionOrUndefined(e.target.value) })}
      >
        <MenuItem value={ALL}>すべて</MenuItem>
        <MenuItem value="event">予定</MenuItem>
        <MenuItem value="task">タスク</MenuItem>
      </TextField>
      <TextField
        label="参加者"
        select
        size="small"
        value={filters.participant ?? ALL}
        onChange={(e) => onChange({ participant: optionOrUndefined(e.target.value) })}
      >
        <MenuItem value={ALL}>すべて</MenuItem>
        {users.map((u) => (
          <MenuItem key={u.id} value={u.id}>
            {u.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="完了"
        select
        size="small"
        value={filters.completed ?? ALL}
        onChange={(e) => onChange({ completed: optionOrUndefined(e.target.value) })}
      >
        <MenuItem value={ALL}>すべて</MenuItem>
        <MenuItem value="open">未完了</MenuItem>
        <MenuItem value="done">完了済み</MenuItem>
      </TextField>
    </FilterPanel>
  );
}
