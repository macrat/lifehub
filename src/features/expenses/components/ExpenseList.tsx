import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { DateHeading } from '../../../lib/ui/DateHeading.tsx';
import { MarkedRow } from '../../../lib/ui/MarkedRow.tsx';
import { useUserColor } from '../../users/use-user-color.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import type { Expense } from '../queries.ts';
import { formatYen } from './BalanceSummary.tsx';

/** 印の点。カレンダーの予定の点と同じ大きさにして、一覧どうしが同じ見た目で並ぶようにする */
const DOT_SX = { width: 10, height: 10, borderRadius: '50%' } as const;

/**
 * 金額の列。桁を揃えて右寄せにし（帳簿と同じ）、行をまたいで金額の大きさを見比べられるようにする。
 * 幅はカレンダーの時刻の列より少し広く、6 桁の金額（¥100,000）まで折り返さない。
 */
const AMOUNT_SX = {
  width: 80,
  flexShrink: 0,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
} as const;

type Props = {
  expenses: Expense[];
  /** 1 件も無いときの文言。検索で 0 件なのか、まだ 1 件も無いのかはページが判断する */
  emptyMessage: string;
  /** 行を押したとき。editing は長押し（編集で開く）か */
  onSelect: (expense: Expense, editing: boolean) => void;
};

/**
 * 立替の履歴（新しい順）。使った日ごとに見出しを立て、その下に 1 件 1 行で並べる。
 * 体裁はカレンダーのリスト表示と同じ（`DateHeading` と `MarkedRow`）で、中身だけが違う:
 * 印は誰から誰へ渡ったかの色の点（`expenseMarkBackground`）、主列は金額、本文は内容と名前。
 */
export function ExpenseList({ expenses, emptyMessage, onSelect }: Props) {
  if (expenses.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ px: 2, py: 2 }}>
        {emptyMessage}
      </Typography>
    );
  }
  return (
    <Stack spacing={1}>
      {[...Map.groupBy(expenses, (e) => e.spentOn)].map(([date, sameDay]) => (
        <Box key={date}>
          <DateHeading date={date} />
          {sameDay.map((expense) => (
            <ExpenseRow key={expense.id} expense={expense} onSelect={onSelect} />
          ))}
        </Box>
      ))}
    </Stack>
  );
}

/** 履歴の 1 行。共有なら名前は払った人だけ、相手が決まっていれば簿記の並びで「To ← From」 */
function ExpenseRow({ expense, onSelect }: { expense: Expense; onSelect: Props['onSelect'] }) {
  const { label } = useUserLabels();
  const colorFor = useUserColor();
  return (
    <MarkedRow
      onSelect={(editing) => onSelect(expense, editing)}
      mark={<Box sx={DOT_SX} style={{ background: expenseMarkBackground(expense, colorFor) }} />}
      lead={
        <Typography variant="body2" component="div" sx={AMOUNT_SX}>
          {formatYen(expense.amount)}
        </Typography>
      }
    >
      <Typography sx={{ overflowWrap: 'anywhere' }}>{expense.description}</Typography>
      <Typography variant="caption" color="text.secondary" component="div" noWrap>
        {expense.toUserId === null
          ? label(expense.fromUserId)
          : `${label(expense.toUserId)} ← ${label(expense.fromUserId)}`}
      </Typography>
    </MarkedRow>
  );
}

/**
 * 印の点の塗り。共有のために払ったものは払った人 1 色、人から人へのものは
 * 斜め 45° で割り、左下を To・右上を From にする。
 *
 * WHY 斜めに割る: 縦か横の境目で割ると、どちらの側がどちらの人かを示す手掛かりが
 * 上下か左右のどちらか一方しか無い。斜めなら、左が To・右が From（名前と同じ
 * 「To ← From」の並び）と、右上から左下へ（From から To へお金が動く向き）を
 * 1 つの点で同時に示せる。2 色はにじませず半分で切り替えて、色を見分けやすくする。
 */
function expenseMarkBackground(
  expense: Expense,
  colorFor: ReturnType<typeof useUserColor>,
): string {
  const from = colorFor(expense.fromUserId).fill;
  if (expense.toUserId === null) return from;
  const to = colorFor(expense.toUserId).fill;
  return `linear-gradient(45deg, ${to} 50%, ${from} 50%)`;
}
