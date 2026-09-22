import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import { formatDate } from '../../../lib/date.ts';
import { RecordListRow } from '../../../lib/ui/RecordListRow.tsx';
import { useUserLabels } from '../../users/use-user-labels.ts';
import type { Expense } from '../queries.ts';
import { formatYen } from './BalanceSummary.tsx';

type Props = {
  expenses: Expense[];
  /** 1 件も無いときの文言。検索で 0 件なのか、まだ 1 件も無いのかはページが判断する */
  emptyMessage: string;
  /** 行を押したとき。editing は長押し（編集で開く）か */
  onSelect: (expense: Expense, editing: boolean) => void;
};

/**
 * 立替の履歴（新しい順）。共有なら From だけ、相手が決まっていれば「From → To」。
 * 行は単押しで閲覧、長押しで編集（`RecordListRow`）。
 */
export function ExpenseList({ expenses, emptyMessage, onSelect }: Props) {
  const { label } = useUserLabels();
  return (
    <List disablePadding>
      {expenses.length === 0 && (
        <ListItem>
          <ListItemText secondary={emptyMessage} />
        </ListItem>
      )}
      {expenses.map((e) => (
        <RecordListRow key={e.id} onSelect={(editing) => onSelect(e, editing)}>
          <ListItemText
            primary={`${formatYen(e.amount)} ${e.description}`}
            secondary={`${formatDate(e.spentOn)} ・ ${
              e.toUserId === null
                ? label(e.fromUserId)
                : `${label(e.fromUserId)} → ${label(e.toUserId)}`
            }`}
          />
        </RecordListRow>
      ))}
    </List>
  );
}
