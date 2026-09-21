import AddIcon from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { CareType } from '../../../shared/validation/lemon.ts';
import { CareLogForm } from '../../features/lemon/components/CareLogForm.tsx';
import { CareLogList } from '../../features/lemon/components/CareLogList.tsx';
import { CareStatusGrid } from '../../features/lemon/components/CareStatusGrid.tsx';
import {
  lemonLogsQueryOptions,
  lemonStatusQueryOptions,
  useDeleteCareLog,
  useLogCare,
} from '../../features/lemon/queries.ts';
import { ensureData } from '../../lib/query-client.ts';
import { keywordSearchSchema, matchesKeyword } from '../../lib/search.ts';
import { FAB_SX } from '../../lib/ui/AppShell.tsx';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';
import { SearchField } from '../../lib/ui/SearchField.tsx';

export const Route = createFileRoute('/_authenticated/lemon')({
  validateSearch: keywordSearchSchema,
  loader: ({ context }) =>
    Promise.all([
      ensureData(context.queryClient, lemonStatusQueryOptions),
      ensureData(context.queryClient, lemonLogsQueryOptions),
    ]),
  component: LemonPage,
});

/**
 * レモンの木の世話。項目ごとの状況と記録の履歴。
 * AppBar の検索窓はメモで履歴を絞り込む（状況のタイルは絞り込みに関わらず最新の実施日を示す）。
 */
function LemonPage() {
  const { q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: statuses = [] } = useQuery(lemonStatusQueryOptions);
  const { data: logs = [] } = useQuery(lemonLogsQueryOptions);
  const logCare = useLogCare();
  const deleteLog = useDeleteCareLog();
  const [adding, setAdding] = useState<CareType | null>(null);

  const keyword = q ?? '';
  const found = logs.filter((log) => matchesKeyword(keyword, log.note));

  return (
    <>
      <AppBarContent>
        <SearchField
          label="メモを検索"
          value={keyword}
          onChange={(value) =>
            // 打つたびに履歴が積み上がらないよう置き換える。スクロール位置も動かさない
            navigate({ search: { q: value || undefined }, replace: true, resetScroll: false })
          }
        />
      </AppBarContent>

      <Box sx={{ px: 2, pt: 1.5 }}>
        <CareStatusGrid statuses={statuses} onSelect={(s) => setAdding(s.careType)} />
      </Box>

      <Typography
        variant="subtitle2"
        component="h3"
        color="text.secondary"
        sx={{ px: 2, pt: 2, fontWeight: 600 }}
      >
        記録
      </Typography>
      <CareLogList
        logs={found}
        emptyMessage={keyword ? '一致する記録はありません' : 'まだ記録はありません'}
        onDelete={(id) => deleteLog.mutate(id)}
      />

      <Fab
        color="primary"
        aria-label="レモンの記録を追加"
        onClick={() => setAdding('water')}
        sx={FAB_SX}
      >
        <AddIcon />
      </Fab>
      {adding && (
        <CareLogForm
          initialCareType={adding}
          onSubmit={(input) => logCare.mutateAsync(input)}
          onClose={() => setAdding(null)}
        />
      )}
    </>
  );
}
