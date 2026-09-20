import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import type { RecurrenceScope } from '../../../../shared/validation/events.ts';

type Props = {
  open: boolean;
  action: '編集' | '削除';
  onSelect: (scope: RecurrenceScope) => void;
  onClose: () => void;
};

const OPTIONS: { scope: RecurrenceScope; label: string; description: string }[] = [
  { scope: 'this', label: 'この回だけ', description: 'この日の分だけ変更する' },
  { scope: 'following', label: 'これ以降すべて', description: 'この日以降の分をまとめて変更する' },
  { scope: 'all', label: 'すべて', description: '過去の分も含めて変更する' },
];

/** 繰り返し予定・タスクの編集・削除で対象範囲を選ぶ。 */
export function RecurrenceScopeDialog({ open, action, onSelect, onClose }: Props) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>繰り返しの{action}</DialogTitle>
      <List>
        {OPTIONS.map((option) => (
          <ListItemButton key={option.scope} onClick={() => onSelect(option.scope)}>
            <ListItemText primary={option.label} secondary={option.description} />
          </ListItemButton>
        ))}
      </List>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
      </DialogActions>
    </Dialog>
  );
}
