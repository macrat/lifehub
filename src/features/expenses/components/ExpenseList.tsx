import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { DateHeading } from '../../../lib/ui/DateHeading.tsx';
import { HistoryList } from '../../../lib/ui/HistoryList.tsx';
import { MarkedRow } from '../../../lib/ui/MarkedRow.tsx';
import { VennMark } from '../../../lib/ui/VennMark.tsx';
import { useUserColor } from '../../users/use-user-color.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { formatYen } from '../format.ts';
import type { Expense, useExpenseHistory } from '../queries.ts';

/**
 * 金額の列の幅。カレンダーの時刻の列より少し広く、6 桁の金額（¥100,000）まで折り返さない。
 * 桁は `MarkedRow` が揃えるので、ここは帳簿と同じ右寄せだけを足す。
 */
const AMOUNT_WIDTH = 80;

type Props = {
  /** 読んだ分の履歴（古い順）と、上の端での読み足しなど（`useExpenseHistory`） */
  history: ReturnType<typeof useExpenseHistory>;
  /** 一覧の上に貼り付けておく物（絞り込みのフォームと残高） */
  header: ReactNode;
  /** 1 件も無いときの文言（`HistoryList`） */
  emptyMessage: string;
  /** 行を押したとき。editing は長押し（編集で開く）か */
  onSelect: (expense: Expense, editing: boolean) => void;
};

/**
 * 立替の履歴（上が古く下が新しい）。最初に出す位置は `HistoryList` が決め、上へスクロールすると古いほうのページを
 * 読み足す（`useExpenseHistory`、`HistoryList`）。使った日ごとに見出しを立て、その下に 1 件 1 行で並べる。
 * 体裁はカレンダーのリスト表示と同じ（`DateHeading` と `MarkedRow`）で、中身だけが違う:
 * 印は誰から誰へ渡ったかのベン図（`expenseMarkColors`）、主列は金額、本文は内容と名前。
 * 名前は共有なら払った人だけ、相手が決まっていれば簿記の並びで「To ← From」。
 */
export function ExpenseList({ history, header, emptyMessage, onSelect }: Props) {
  const { label } = useUserLabels();
  const colorFor = useUserColor();
  return (
    <HistoryList history={history} header={header} emptyMessage={emptyMessage}>
      {(expenses) =>
        [...Map.groupBy(expenses, (e) => e.spentOn)].map(([date, sameDay]) => (
          <Box key={date} sx={{ pb: 1 }}>
            <DateHeading date={date} />
            {sameDay.map((expense) => (
              <MarkedRow
                key={expense.id}
                onSelect={(editing) => onSelect(expense, editing)}
                mark={<VennMark colors={expenseMarkColors(expense, colorFor)} />}
                leadWidth={AMOUNT_WIDTH}
                lead={
                  <Typography variant="body2" component="div" sx={{ textAlign: 'right' }}>
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
            ))}
          </Box>
        ))
      }
    </HistoryList>
  );
}

/**
 * 印（`VennMark`）の円の色。共有のために払ったものは払った人 1 色の円、人から人へのものは
 * 左を To・右を From の円にする（名前と同じ「To ← From」の並び）。
 */
function expenseMarkColors(expense: Expense, colorFor: ReturnType<typeof useUserColor>): string[] {
  const from = colorFor(expense.fromUserId).mark;
  if (expense.toUserId === null) return [from];
  return [colorFor(expense.toUserId).mark, from];
}
