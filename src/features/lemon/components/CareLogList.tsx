import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import { CARE_TYPE_LABELS } from '../../../../shared/validation/lemon.ts';
import { formatDateTime } from '../../../lib/date.ts';
import type { CareLog } from '../queries.ts';

type Props = {
  logs: CareLog[];
  /** 1 件も無いときの文言。検索で 0 件なのか、まだ 1 件も無いのかはページが判断する */
  emptyMessage: string;
  /** 行をタップしたとき（詳細を開く） */
  onSelect: (log: CareLog) => void;
};

/** 世話の記録（新しい順）。行をタップで詳細（編集・削除はそこに集める） */
export function CareLogList({ logs, emptyMessage, onSelect }: Props) {
  return (
    <List disablePadding>
      {logs.length === 0 && (
        <ListItem>
          <ListItemText secondary={emptyMessage} />
        </ListItem>
      )}
      {logs.map((log) => (
        <ListItem key={log.id} divider disablePadding>
          <ListItemButton onClick={() => onSelect(log)}>
            <ListItemText
              primary={CARE_TYPE_LABELS[log.careType]}
              secondary={[formatDateTime(log.doneAt), log.note].filter(Boolean).join(' ・ ')}
              slotProps={{ secondary: { noWrap: true } }}
            />
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
}
