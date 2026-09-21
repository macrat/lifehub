import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
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

/** 読み上げ用の名前と説明文は操作に合わせる（削除の選択肢に「変更する」と書かない） */
const ACTIONS: Record<RecurrenceAction, { name: string; verb: string }> = {
  edit: { name: '繰り返しの編集', verb: '変更' },
  delete: { name: '繰り返しの削除', verb: '削除' },
};

const OPTIONS: { scope: RecurrenceScope; label: string; target: string }[] = [
  { scope: 'this', label: 'この回だけ', target: 'この日の分だけ' },
  { scope: 'following', label: 'これ以降すべて', target: 'この日以降の分をまとめて' },
  { scope: 'all', label: 'すべて', target: '過去の分も含めて' },
];

/**
 * 繰り返し予定・タスクの編集・削除で対象範囲を選ぶ。範囲を選ぶ間だけ呼び出し側がマウントする。
 * 選択肢そのものが何を選ぶのかを示すので、見出しは置かない（名前は読み上げにだけ渡す）。
 */
export function RecurrenceScopeDialog({ action, onSelect, onClose }: Props) {
  const { name, verb } = ACTIONS[action];
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" label={name}>
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
