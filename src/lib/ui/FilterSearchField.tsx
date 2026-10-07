import { FilterButton } from './FilterButton.tsx';
import { SearchField } from './SearchField.tsx';

type Props = {
  /** 何を検索するのかを示す文言（`SearchField`） */
  label: string;
  /** 画面の検索の状態（`useFilterSearch` の戻り値をそのまま渡す） */
  search: {
    filters: { q: string };
    setKeyword: (keyword: string) => void;
    activeFilters: number;
    panelOpen: boolean;
    togglePanel: () => void;
  };
};

/**
 * 絞り込みのある画面（ホーム・お金・レモン）の AppBar に置く、検索窓と絞り込みボタンの塊。
 * キーワードは検索窓に、それ以外の絞り込みはボタンで開くフォーム（`FilterPanel`）にあり、
 * フォームを閉じていても効いている数はボタンのバッジに出る。
 */
export function FilterSearchField({ label, search }: Props) {
  return (
    <SearchField label={label} value={search.filters.q} onChange={search.setKeyword}>
      <FilterButton
        open={search.panelOpen}
        count={search.activeFilters}
        onToggle={search.togglePanel}
      />
    </SearchField>
  );
}
