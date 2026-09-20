import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { CARE_TYPE_LABELS, type CareType } from '../../../shared/validation/lemon.ts';
import { CareLogForm } from '../../features/lemon/components/CareLogForm.tsx';
import { CareStatusGrid } from '../../features/lemon/components/CareStatusGrid.tsx';
import {
  lemonLogsQueryOptions,
  lemonStatusQueryOptions,
  useDeleteCareLog,
  useLogCare,
} from '../../features/lemon/queries.ts';
import { formatDateTime } from '../../lib/date.ts';
import { ensureData } from '../../lib/query-client.ts';

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
      <Paper>
        <List disablePadding>
          {logs.length === 0 && (
            <ListItem>
              <ListItemText secondary="まだ記録はありません" />
            </ListItem>
          )}
          {logs.map((log) => (
            <ListItem
              key={log.id}
              divider
              secondaryAction={
                <IconButton
                  edge="end"
                  aria-label={`${CARE_TYPE_LABELS[log.careType]}の記録を削除`}
                  onClick={() => {
                    if (window.confirm('この記録を削除しますか？')) deleteLog.mutate(log.id);
                  }}
                >
                  <DeleteIcon />
                </IconButton>
              }
            >
              <ListItemText
                primary={CARE_TYPE_LABELS[log.careType]}
                secondary={[formatDateTime(log.doneAt), log.note].filter(Boolean).join(' ・ ')}
                slotProps={{ secondary: { sx: { whiteSpace: 'pre-wrap' } } }}
              />
            </ListItem>
          ))}
        </List>
      </Paper>

      <Fab
        color="primary"
        aria-label="レモンの記録を追加"
        onClick={() => setAdding('water')}
        sx={{
          position: 'fixed',
          right: 16,
          bottom: { xs: 'calc(56px + env(safe-area-inset-bottom) + 16px)', md: 24 },
        }}
      >
        <AddIcon />
      </Fab>
      {adding && (
        <CareLogForm
          open
          initialCareType={adding}
          onSubmit={(input) => logCare.mutateAsync(input)}
          onClose={() => setAdding(null)}
        />
      )}
    </>
  );
}
