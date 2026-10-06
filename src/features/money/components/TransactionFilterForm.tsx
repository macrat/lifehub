import type { TransactionFilter } from '../../../../shared/validation/money.ts';
import type { FiltersPatch } from '../../../lib/search.ts';
import { DateRangeFilter } from '../../../lib/ui/DateRangeFilter.tsx';
import { FilterPanel } from '../../../lib/ui/FilterPanel.tsx';
import { FilterSelect } from '../../../lib/ui/FilterSelect.tsx';

type Props = {
  open: boolean;
  filters: TransactionFilter;
  /** 選べる金融機関（お金の画面のカードと同じ並び） */
  accounts: readonly string[];
  onChange: (next: FiltersPatch<TransactionFilter>) => void;
};

/**
 * 入出金の詳細な検索（AppBar の絞り込みボタンで開く）。日付の範囲と金融機関で履歴を絞り込む。
 * 内容のキーワードは AppBar の検索窓が持つのでここには無い。振る舞いは立替の詳細な検索（`ExpenseFilterForm`）と同じ。
 */
export function TransactionFilterForm({ open, filters, accounts, onChange }: Props) {
  return (
    <FilterPanel open={open}>
      <DateRangeFilter since={filters.since} until={filters.until} onChange={onChange} />
      <FilterSelect
        label="金融機関"
        value={filters.account}
        options={accounts.map((name) => ({ value: name, label: name }))}
        onChange={(account) => onChange({ account })}
      />
    </FilterPanel>
  );
}
