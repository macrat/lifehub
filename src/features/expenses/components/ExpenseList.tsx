import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import { AlignedAmount } from '../../../lib/ui/AlignedAmount.tsx';
import { DateHeading } from '../../../lib/ui/DateHeading.tsx';
import { HistoryList, type HistoryListProps } from '../../../lib/ui/HistoryList.tsx';
import { MarkedRow } from '../../../lib/ui/MarkedRow.tsx';
import { VennMark } from '../../../lib/ui/VennMark.tsx';
import { formatYen, widestOf } from '../../../lib/yen.ts';
import { useUserColor } from '../../users/use-user-color.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { partiesInOrder, partiesLabel } from '../parties.ts';
import type { Expense } from '../queries.ts';

/** 印の枠の幅。印（`VennMark`）は見せるだけで押せないので、枠を印の大きさぴったりにして金額との間を空けない */
const MARK_WIDTH = 20;

type Props = Omit<HistoryListProps<Expense>, 'children'> & {
  /** 行を押したとき。editing は長押し（編集で開く）か */
  onSelect: (expense: Expense, editing: boolean) => void;
};

/**
 * 立替の履歴（上が新しく下が古い）。最初に出す位置は `HistoryList` が決め、下へスクロールすると古いほうのページを
 * 読み足す（`expenseHistory` を画面が `useScreenHistory` で購読し、`HistoryList` で出す）。使った日ごとに見出しを立て、その下に 1 件 1 行で並べる
 * （日も行も `HistoryList` が渡す順のまま）。
 * 体裁はカレンダーのリスト表示と同じ（`DateHeading` と `MarkedRow`）で、中身だけが違う:
 * 印は誰から誰へ渡ったかのベン図、主列は金額、本文は内容と名前。
 * 名前は共有なら払った人だけ、相手が決まっていれば簿記の並びで「To ← From」（`partiesInOrder`）。
 * 印も同じ並びで、共有のために払ったものは払った人 1 色の円、人から人へのものは左を To・右を From の円にする。
 */
export function ExpenseList({ onSelect, ...listProps }: Props) {
  const { label } = useUserLabels();
  const colorFor = useUserColor();
  const items = listProps.history.query.data?.items;
  // 読んだ記録が増えるほど重くなるので、記録が変わったときだけ求め直す
  const widest = useMemo(() => widestOf((items ?? []).map((e) => formatYen(e.amount))), [items]);
  return (
    <HistoryList {...listProps}>
      {(expenses) =>
        [...Map.groupBy(expenses, (e) => e.spentOn)].map(([date, sameDay]) => (
          <Box key={date} sx={{ pb: 1 }}>
            <DateHeading date={date} />
            {sameDay.map((expense) => {
              const people = partiesInOrder(expense);
              return (
                <MarkedRow
                  key={expense.id}
                  moveKey={expense.id}
                  onSelect={(editing) => onSelect(expense, editing)}
                  mark={<VennMark colors={people.map((id) => colorFor(id).mark)} />}
                  markWidth={MARK_WIDTH}
                  lead={<AlignedAmount text={formatYen(expense.amount)} widest={widest} />}
                >
                  <Typography sx={{ overflowWrap: 'anywhere' }}>{expense.description}</Typography>
                  <Typography variant="caption" color="textSecondary" component="div" noWrap>
                    {partiesLabel(people, label)}
                  </Typography>
                </MarkedRow>
              );
            })}
          </Box>
        ))
      }
    </HistoryList>
  );
}
