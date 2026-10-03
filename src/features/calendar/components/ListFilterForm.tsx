import { ADD_KINDS } from '../../../lib/add-kinds.ts';
import { DateRangeFilter } from '../../../lib/ui/DateRangeFilter.tsx';
import { FilterPanel } from '../../../lib/ui/FilterPanel.tsx';
import { FilterSelect } from '../../../lib/ui/FilterSelect.tsx';
import { useUserLabels } from '../../users/use-user-labels.ts';
import type { ListFilters, ListFiltersPatch } from '../search.ts';

/** 種別の選択肢。名前は追加ボタンなどと同じもの（`ADD_KINDS`） */
const KIND_OPTIONS = (['event', 'task'] as const).map((kind) => ({
  value: kind,
  label: ADD_KINDS[kind].label,
}));

const COMPLETED_OPTIONS = [
  { value: 'open', label: '未完了' },
  { value: 'done', label: '完了済み' },
] as const;

type Props = {
  open: boolean;
  filters: ListFilters;
  onChange: (next: ListFiltersPatch) => void;
};

/**
 * リスト表示の詳細な絞り込み（期間・種別・参加者・完了状態）。キーワードは AppBar の検索窓が持つ。
 * 「すべて」と空欄は絞り込まない状態として URL に残さない（`FilterSelect`・`DateRangeFilter`）。
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
      <FilterSelect
        label="種別"
        value={filters.kind}
        options={KIND_OPTIONS}
        onChange={(kind) => onChange({ kind })}
      />
      <FilterSelect
        label="参加者"
        value={filters.participant}
        options={users.map((u) => ({ value: u.id, label: u.name }))}
        onChange={(participant) => onChange({ participant })}
      />
      <FilterSelect
        label="完了"
        value={filters.completed}
        options={COMPLETED_OPTIONS}
        onChange={(completed) => onChange({ completed })}
      />
    </FilterPanel>
  );
}
