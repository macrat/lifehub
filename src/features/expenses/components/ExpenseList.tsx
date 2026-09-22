import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import { formatDate } from '../../../lib/date.ts';
import { useRecordPress } from '../../../lib/ui/use-record-press.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import type { Expense } from '../queries.ts';
import { formatYen } from './BalanceSummary.tsx';

type Props = {
  expenses: Expense[];
  /** 1 件も無いときの文言。検索で 0 件なのか、まだ 1 件も無いのかはページが判断する */
  emptyMessage: string;
  /** 行を単押ししたとき（詳細を読むだけで開く） */
  onView: (expense: Expense) => void;
  /** 行を長押ししたとき（詳細を編集で開く） */
  onEdit: (expense: Expense) => void;
};

/**
 * 立替の履歴（新しい順）。共有なら From だけ、相手が決まっていれば「From → To」。
 * 行は単押しで閲覧、長押しで編集（`useRecordPress`）。
 */
export function ExpenseList({ expenses, emptyMessage, onView, onEdit }: Props) {
  return (
    <List disablePadding>
      {expenses.length === 0 && (
        <ListItem>
          <ListItemText secondary={emptyMessage} />
        </ListItem>
      )}
      {expenses.map((expense) => (
        <ExpenseRow
          key={expense.id}
          expense={expense}
          onView={() => onView(expense)}
          onEdit={() => onEdit(expense)}
        />
      ))}
    </List>
  );
}

function ExpenseRow({
  expense,
  onView,
  onEdit,
}: {
  expense: Expense;
  onView: () => void;
  onEdit: () => void;
}) {
  const { label } = useUserLabels();
  const press = useRecordPress({ onView, onEdit });
  return (
    <ListItem divider disablePadding>
      <ListItemButton {...press}>
        <ListItemText
          primary={`${formatYen(expense.amount)} ${expense.description}`}
          secondary={`${formatDate(expense.spentOn)} ・ ${
            expense.toUserId === null
              ? label(expense.fromUserId)
              : `${label(expense.fromUserId)} → ${label(expense.toUserId)}`
          }`}
        />
      </ListItemButton>
    </ListItem>
  );
}
