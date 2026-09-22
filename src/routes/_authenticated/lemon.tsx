import AddIcon from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { CareType } from '../../../shared/validation/lemon.ts';
import { CareLogDetailSheet } from '../../features/lemon/components/CareLogDetailSheet.tsx';
import { CareLogFilterForm } from '../../features/lemon/components/CareLogFilterForm.tsx';
import { CareLogForm, DEFAULT_CARE_TYPES } from '../../features/lemon/components/CareLogForm.tsx';
import { CareLogList } from '../../features/lemon/components/CareLogList.tsx';
import { CareStatusGrid } from '../../features/lemon/components/CareStatusGrid.tsx';
import {
  type CareLog,
  lemonLogsQueryOptions,
  lemonStatusQueryOptions,
  useLogCare,
} from '../../features/lemon/queries.ts';
import { lemonSearchSchema, matchesCareLog, useLemonSearch } from '../../features/lemon/search.ts';
import { useAddShortcut } from '../../lib/add-shortcut.ts';
import { FAB_SX } from '../../lib/ui/AppShell.tsx';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';
import { FilterButton } from '../../lib/ui/FilterButton.tsx';
import { ListSkeleton, QueryView } from '../../lib/ui/QueryView.tsx';
import { SearchField } from '../../lib/ui/SearchField.tsx';

export const Route = createFileRoute('/_authenticated/lemon')({
  validateSearch: lemonSearchSchema,
  component: LemonPage,
});

/**
 * レモンの木の世話。項目ごとの状況と記録の履歴。
 * 履歴の行をタップすると詳細（削除）が開く。
 * AppBar の検索窓はメモで、その右の絞り込みボタンで開くフォームは項目と実施日の範囲で履歴を絞り込む
 * （状況のタイルは絞り込みに関わらず最新の実施日を示す）。
 * PWA のショートカットからは入力を開いた状態で始まる（`add=lemon`）。
 */
function LemonPage() {
  const search = Route.useSearch();
  const { filters, activeFilters, setKeyword, setFilters } = useLemonSearch(search);
  const statusQuery = useQuery(lemonStatusQueryOptions);
  const logsQuery = useQuery(lemonLogsQueryOptions);
  const logCare = useLogCare();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [adding, setAdding] = useState<CareType[] | null>(null);
  const [selected, setSelected] = useState<CareLog | null>(null);
  const filtering = filters.q !== '' || activeFilters > 0;

  // PWA のショートカットから来たら、追加ボタンと同じ既定の項目で入力を開く
  useAddShortcut(
    search.add,
    () => setAdding(DEFAULT_CARE_TYPES),
    () => setFilters({ add: undefined }),
  );

  return (
    <>
      <AppBarContent>
        <SearchField label="メモを検索" value={filters.q} onChange={setKeyword}>
          <FilterButton
            open={filtersOpen}
            count={activeFilters}
            onToggle={() => setFiltersOpen((v) => !v)}
          />
        </SearchField>
      </AppBarContent>

      <CareLogFilterForm open={filtersOpen} filters={filters} onChange={setFilters} />

      <Box sx={{ px: 2, pt: 1.5 }}>
        <QueryView query={statusQuery} skeleton={<Skeleton variant="rounded" height={86} />}>
          {(statuses) => (
            <CareStatusGrid statuses={statuses} onSelect={(s) => setAdding([s.careType])} />
          )}
        </QueryView>
      </Box>

      <Typography
        variant="subtitle2"
        component="h3"
        color="text.secondary"
        sx={{ px: 2, pt: 2, fontWeight: 600 }}
      >
        記録
      </Typography>
      <QueryView query={logsQuery} skeleton={<ListSkeleton />}>
        {(logs) => (
          <CareLogList
            logs={logs.filter((log) => matchesCareLog(log, filters))}
            emptyMessage={filtering ? '一致する記録はありません' : 'まだ記録はありません'}
            onSelect={setSelected}
          />
        )}
      </QueryView>

      <Fab
        color="primary"
        aria-label="レモンの記録を追加"
        onClick={() => setAdding(DEFAULT_CARE_TYPES)}
        sx={FAB_SX}
      >
        <AddIcon />
      </Fab>
      {adding && (
        <CareLogForm
          initialCareTypes={adding}
          onSubmit={logCare.mutateAsync}
          onClose={() => setAdding(null)}
        />
      )}
      {selected && <CareLogDetailSheet log={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
