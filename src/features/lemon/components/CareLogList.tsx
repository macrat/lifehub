import DeleteIcon from '@mui/icons-material/Delete';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import { CARE_TYPE_LABELS } from '../../../../shared/validation/lemon.ts';
import { formatDateTime } from '../../../lib/date.ts';
import type { CareLog } from '../queries.ts';

type Props = {
  logs: CareLog[];
  onDelete: (id: string) => void;
};

/** 世話の記録（新しい順） */
export function CareLogList({ logs, onDelete }: Props) {
  return (
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
                if (window.confirm('この記録を削除しますか？')) onDelete(log.id);
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
  );
}
