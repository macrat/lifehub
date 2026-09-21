import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import type { RecurrenceScope } from '../../../../shared/validation/events.ts';
import { Dialog } from '../../../lib/ui/Dialog.tsx';
import type { RecurrenceAction } from '../use-recurrence-editing.ts';

type Props = {
  action: RecurrenceAction;
  onSelect: (scope: RecurrenceScope) => void;
  onClose: () => void;
};

/** 見出しと説明文は操作に合わせる（削除の選択肢に「変更する」と書かない） */
const VERBS: Record<RecurrenceAction, string> = { edit: '変更', delete: '削除' };

const OPTIONS: { scope: RecurrenceScope; label: string; target: string }[] = [
  { scope: 'this', label: 'この回だけ', target: 'この日の分だけ' },
  { scope: 'following', label: 'これ以降すべて', target: 'この日以降の分をまとめて' },
  { scope: 'all', label: 'すべて', target: '過去の分も含めて' },
];

/**
 * 繰り返し予定・タスクの編集・削除で対象範囲を選ぶ。範囲を選ぶ間だけ呼び出し側がマウントする。
 * 選ぶだけのダイアログなので、見出しには何を選ぶのかを出す。
 */
export function RecurrenceScopeDialog({ action, onSelect, onClose }: Props) {
  const verb = VERBS[action];
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{verb}する範囲を選ぶ</DialogTitle>
      <List>
        {OPTIONS.map((option) => (
          <ListItemButton key={option.scope} onClick={() => onSelect(option.scope)}>
            <ListItemText primary={option.label} secondary={`${option.target}${verb}する`} />
          </ListItemButton>
        ))}
      </List>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
      </DialogActions>
    </Dialog>
  );
}
