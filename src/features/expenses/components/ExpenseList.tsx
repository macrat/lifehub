import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import { formatDate } from '../../../lib/date.ts';
import { RecordListRow } from '../../../lib/ui/RecordListRow.tsx';
import { useUserColor } from '../../users/use-user-color.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import type { Expense } from '../queries.ts';
import { formatYen } from './BalanceSummary.tsx';

/** 左端の帯と、その右の中身。帯は行の左端に貼り付けるので、行の左の余白は持たない */
const ROW_SX = { pl: 0, gap: 2, alignItems: 'stretch' } as const;

/**
 * 色の帯。上下の余白を負のマージンで打ち消して、行の高さいっぱいに伸ばす
 * （行と行の区切りまで届かせて、帯が浮いて見えないようにする）。
 */
const BAR_SX = { width: 6, flexShrink: 0, my: -1 } as const;

type Props = {
  expenses: Expense[];
  /** 1 件も無いときの文言。検索で 0 件なのか、まだ 1 件も無いのかはページが判断する */
  emptyMessage: string;
  /** 行を押したとき。editing は長押し（編集で開く）か */
  onSelect: (expense: Expense, editing: boolean) => void;
};

/**
 * 立替の履歴（新しい順）。共有なら From だけ、相手が決まっていれば簿記の並びで「To ← From」。
 * 左端の帯は誰から誰へ渡ったかを色で示す（上が From・下が To。`expenseBarBackground`）。
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
        <RecordListRow key={e.id} sx={ROW_SX} onSelect={(editing) => onSelect(e, editing)}>
          <Box sx={{ ...BAR_SX, background: expenseBarBackground(e, colorFor) }} />
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
 * 上が From・下が To の 2 色に割る（お金が上から下へ流れる向き）。
 * 幅 6px を縦に割ると 1 色が 3px しか残らず読めないので、分けるのは上下にする。
 * 2 色はにじませず半分で切り替えて、どちらの色かが一目で分かるようにする。
 * 境目を 200deg（真下から少し傾けた向き）にすると、水平の線と見分けられる。
 */
function expenseBarBackground(expense: Expense, colorFor: ReturnType<typeof useUserColor>): string {
  const from = colorFor(expense.fromUserId).fill;
  if (expense.toUserId === null) return from;
  const to = colorFor(expense.toUserId).fill;
  return `linear-gradient(200deg, ${from} 50%, ${to} 50%)`;
}
