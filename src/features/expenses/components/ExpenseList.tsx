import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import { formatDate } from '../../../lib/date.ts';
import { RecordListRow } from '../../../lib/ui/RecordListRow.tsx';
import { useUserColor } from '../../users/use-user-color.ts';
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
 * 立替の履歴（新しい順）。共有なら From だけ、相手が決まっていれば簿記の並びで「To ← From」。
 * 左端の帯は誰から誰へ渡ったかを色で示す（`expenseBarBackground`）。
 * 行は単押しで閲覧、長押しで編集（`RecordListRow`）。
 */
export function ExpenseList({ expenses, emptyMessage, onSelect }: Props) {
  const { label } = useUserLabels();
  const colorFor = useUserColor();
  return (
    <List disablePadding>
      {expenses.length === 0 && (
        <ListItem>
          <ListItemText secondary={emptyMessage} />
        </ListItem>
      )}
      {expenses.map((e) => (
        <RecordListRow
          key={e.id}
          stripe={expenseBarBackground(e, colorFor)}
          onSelect={(editing) => onSelect(e, editing)}
        >
          <ListItemText
            primary={`${formatYen(e.amount)} ${e.description}`}
            secondary={`${formatDate(e.spentOn)} ・ ${
              e.toUserId === null
                ? label(e.fromUserId)
                : `${label(e.toUserId)} ← ${label(e.fromUserId)}`
            }`}
          />
        </RecordListRow>
      ))}
    </List>
  );
}

/**
 * 行の帯の塗り。共有のために払ったものは払った人 1 色、人から人へのものは
 * 上が From・下が To の 2 色に割る。2 色はにじませず半分で切り替えて、
 * どちらの色かが一目で分かるようにする。
 *
 * WHY 境目を斜め（220deg）にする: 縦の境目で左右に割ると、細い帯がさらに半分になり
 * 色を判別できない。かといって横の境目で上下に割るだけでは、
 * 貸方・借方の左右の並び（名前と同じ「To ← From」）を暗示できない。
 * 斜めなら 1 色ずつの面積を保ったまま、左寄りが To・右寄りが From になり、
 * 上下（お金の流れ）と左右（簿記の並び）の両方を 1 本で示せる。
 */
function expenseBarBackground(expense: Expense, colorFor: ReturnType<typeof useUserColor>): string {
  const from = colorFor(expense.fromUserId).fill;
  if (expense.toUserId === null) return from;
  const to = colorFor(expense.toUserId).fill;
  return `linear-gradient(220deg, ${from} 50%, ${to} 50%)`;
}
