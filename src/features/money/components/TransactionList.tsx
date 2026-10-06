import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import { AlignedAmount } from '../../../lib/ui/AlignedAmount.tsx';
import { DateHeading } from '../../../lib/ui/DateHeading.tsx';
import { HistoryList, type HistoryListProps } from '../../../lib/ui/HistoryList.tsx';
import { MarkedRow } from '../../../lib/ui/MarkedRow.tsx';
import { VennMark } from '../../../lib/ui/VennMark.tsx';
import { formatSignedYen, widestOf } from '../../../lib/yen.ts';
import { useUserColor } from '../../users/use-user-color.ts';
import type { MoneyTransaction } from '../queries.ts';
import { transactionCaption } from '../transaction-view.ts';

/** 印の枠の幅（立替の履歴と同じ。`ExpenseList`） */
const MARK_WIDTH = 20;

type Props = Omit<HistoryListProps<MoneyTransaction>, 'children'> & {
  onSelect: (transaction: MoneyTransaction) => void;
};

/**
 * 入出金の履歴（上が新しく下が古い）。体裁は立替の履歴（`ExpenseList`）と同じで、日ごとの見出しと 1 件 1 行。
 * 印は誰のものでもない無彩色の点（取り込んだ入出金は人に結び付かない。タイムラインの丸も同じ色）、
 * 主列は入金に + を付けた金額、本文は内容と、金融機関・分類。
 * 読むだけの記録なので、長押しも単押しと同じく詳細を開く。
 */
export function TransactionList({ onSelect, ...listProps }: Props) {
  const colorFor = useUserColor();
  const mark = colorFor(null).mark;
  const items = listProps.history.query.data?.items;
  // 読んだ記録が増えるほど重くなるので、記録が変わったときだけ求め直す
  const widest = useMemo(
    () => widestOf((items ?? []).map((t) => formatSignedYen(t.amount))),
    [items],
  );
  return (
    <HistoryList {...listProps}>
      {(transactions) =>
        [...Map.groupBy(transactions, (t) => t.occurredOn)].map(([date, sameDay]) => (
          <Box key={date} sx={{ pb: 1 }}>
            <DateHeading date={date} />
            {sameDay.map((transaction) => (
              <MarkedRow
                key={transaction.id}
                onSelect={() => onSelect(transaction)}
                mark={<VennMark colors={[mark]} />}
                markWidth={MARK_WIDTH}
                lead={<AlignedAmount text={formatSignedYen(transaction.amount)} widest={widest} />}
              >
                <Typography sx={{ overflowWrap: 'anywhere' }}>{transaction.description}</Typography>
                <Typography variant="caption" color="textSecondary" component="div" noWrap>
                  {transactionCaption(transaction)}
                </Typography>
              </MarkedRow>
            ))}
          </Box>
        ))
      }
    </HistoryList>
  );
}
