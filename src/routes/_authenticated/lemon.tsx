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
import { FAB_SX } from '../../lib/ui/AppShell.tsx';

export const Route = createFileRoute('/_authenticated/lemon')({
  loader: ({ context }) =>
    Promise.all([
      ensureData(context.queryClient, lemonStatusQueryOptions),
      ensureData(context.queryClient, lemonLogsQueryOptions),
    ]),
  component: LemonPage,
});

function LemonPage() {
  const { data: statuses = [] } = useQuery(lemonStatusQueryOptions);
  const { data: logs = [] } = useQuery(lemonLogsQueryOptions);
  const logCare = useLogCare();
  const deleteLog = useDeleteCareLog();
  const [adding, setAdding] = useState<CareType | null>(null);

  return (
    <>
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
      <CareLogList logs={logs} onDelete={(id) => deleteLog.mutate(id)} />

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
          onSubmit={logCare.mutate}
          onClose={() => setAdding(null)}
        />
      )}
    </>
  );
}
