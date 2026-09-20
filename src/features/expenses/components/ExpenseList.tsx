import DeleteIcon from '@mui/icons-material/Delete';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import { formatDate } from '../../../lib/date.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import type { Expense } from '../queries.ts';
import { formatYen } from './BalanceSummary.tsx';

type Props = {
  expenses: Expense[];
  onDelete: (id: string) => void;
};

/** 立替の履歴（新しい順）。共有なら From だけ、相手が決まっていれば「From → To」 */
export function ExpenseList({ expenses, onDelete }: Props) {
  const { label } = useUserLabels();
  return (
    <List disablePadding>
      {expenses.length === 0 && (
        <ListItem>
          <ListItemText secondary="まだ立替はありません" />
        </ListItem>
      )}
      {expenses.map((e) => (
        <ListItem
          key={e.id}
          divider
          secondaryAction={
            <IconButton
              edge="end"
              aria-label={`${e.description} を削除`}
              onClick={() => {
                if (window.confirm('この立替を削除しますか？')) onDelete(e.id);
              }}
            >
              <DeleteIcon />
            </IconButton>
          }
        >
          <ListItemText
            primary={`${formatYen(e.amount)} ${e.description}`}
            secondary={`${formatDate(e.spentOn)} ・ ${
              e.toUserId === null
                ? label(e.fromUserId)
                : `${label(e.fromUserId)} → ${label(e.toUserId)}`
            }`}
          />
        </ListItem>
      ))}
    </List>
  );
}
