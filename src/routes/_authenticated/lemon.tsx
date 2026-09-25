import Box from '@mui/material/Box';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { CareType } from '../../../shared/validation/lemon.ts';
import { CareLogDetailSheet } from '../../features/lemon/components/CareLogDetailSheet.tsx';
import { CareLogFilterForm } from '../../features/lemon/components/CareLogFilterForm.tsx';
import { CareLogForm } from '../../features/lemon/components/CareLogForm.tsx';
import { CareLogList } from '../../features/lemon/components/CareLogList.tsx';
import {
  CareStatusGrid,
  CareStatusGridSkeleton,
} from '../../features/lemon/components/CareStatusGrid.tsx';
import {
  type CareLog,
  lemonStatusQueryOptions,
  useCareLogHistory,
} from '../../features/lemon/queries.ts';
import { countActiveFilters, lemonSearchSchema } from '../../features/lemon/search.ts';
import { DEFAULT_CARE_TYPES } from '../../features/lemon/use-care-log-form.ts';
import { useAddShortcut } from '../../lib/add-search.ts';
import { useFilterSearch } from '../../lib/search.ts';
import { AddFab } from '../../lib/ui/AddFab.tsx';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';
import { FilterButton } from '../../lib/ui/FilterButton.tsx';
import { QueryView } from '../../lib/ui/QueryView.tsx';
import { SearchField } from '../../lib/ui/SearchField.tsx';
import { useRecordSelection } from '../../lib/ui/use-record-selection.ts';
import { useOpenWith, useToggle } from '../../lib/ui/use-toggle.ts';

export const Route = createFileRoute('/_authenticated/lemon')({
  validateSearch: lemonSearchSchema,
  staticData: { ownsScroll: true },
  component: LemonPage,
});

/**
 * レモンの木の世話。項目ごとの状況と記録の履歴。
 * 履歴は上が古く下が新しい無限スクロールで、最初に出す位置は `HistoryList` が決め、上へ戻ると古いほうのページを読む。
 * 絞り込みのフォームと状況のタイルは一覧の上に貼り付けて、どこまでスクロールしても隠れない。
 * 履歴の行を単押しすると詳細、長押しするとその詳細が編集で開く（アプリ全体の「単押しは閲覧、長押しは編集」）。
 * 削除は詳細の三点リーダーの中。
 * AppBar の検索窓はメモで（絞り込みはサーバーが掛ける）、その右の絞り込みボタンで開くフォームは項目と実施日の範囲で履歴を絞り込む
 * （状況のタイルは絞り込みに関わらず最新の実施日を示す）。
 */
function LemonPage() {
  const search = Route.useSearch();
  const { filters, listFilter, setKeyword, setFilters, activeFilters, filtering } = useFilterSearch(
    search,
    countActiveFilters,
  );
  // 詳細な絞り込みのフォームを開いているか（URL には載せない。開き直したら閉じている）
  const panel = useToggle();
  const statusQuery = useQuery(lemonStatusQueryOptions);
  const history = useCareLogHistory(listFilter);
  // 追加のフォームと、最初から選んでおく項目（状況のタイルから開くとその項目）
  const adding = useOpenWith<CareType[]>();
  const selection = useRecordSelection<CareLog>();

  const openAdd = () => adding.open(DEFAULT_CARE_TYPES);
  useAddShortcut(search.add, openAdd);

  return (
    <>
      <AppBarContent>
        <SearchField label="メモを検索" value={filters.q} onChange={setKeyword}>
          <FilterButton open={panel.value} count={activeFilters} onToggle={panel.toggle} />
        </SearchField>
      </AppBarContent>

      <CareLogList
        history={history}
        header={
          <>
            <CareLogFilterForm open={panel.value} filters={filters} onChange={setFilters} />
            <Box sx={{ px: 2, py: 1.5 }}>
              <QueryView query={statusQuery} skeleton={<CareStatusGridSkeleton />}>
                {(statuses) => (
                  <CareStatusGrid statuses={statuses} onSelect={(s) => adding.open([s.careType])} />
                )}
              </QueryView>
            </Box>
          </>
        }
        emptyMessage={filtering ? '一致する記録はありません' : 'まだ記録はありません'}
        onSelect={selection.open}
      />

      <AddFab label="レモンの記録を追加" onClick={openAdd} />
      {adding.value && <CareLogForm initialCareTypes={adding.value} onClose={adding.close} />}
      {selection.selected && (
        <CareLogDetailSheet
          log={selection.selected.record}
          initialEditing={selection.selected.editing}
          onClose={selection.close}
        />
      )}
    </>
  );
}
