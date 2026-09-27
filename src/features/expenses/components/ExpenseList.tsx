import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import { DateHeading } from '../../../lib/ui/DateHeading.tsx';
import { HistoryList, type HistoryListProps } from '../../../lib/ui/HistoryList.tsx';
import { MarkedRow } from '../../../lib/ui/MarkedRow.tsx';
import { VennMark } from '../../../lib/ui/VennMark.tsx';
import { useUserColor } from '../../users/use-user-color.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { formatYen } from '../format.ts';
import { PARTIES_SEPARATOR, partiesInOrder } from '../parties.ts';
import type { Expense } from '../queries.ts';

/** 印の枠の幅。印（`VennMark`）は見せるだけで押せないので、枠を印の大きさぴったりにして金額との間を空けない */
const MARK_WIDTH = 20;

/**
 * 金額の列。列の幅は読んだ記録の中で一番幅を取る金額に合わせる（`widest`）: 決め打ちの幅だと、
 * 普段の数千円の記録にまれな 6 桁が収まる幅を取り続けて本文が狭くなる。
 * 幅は測らず、一番幅を取る金額を透明にして同じ升目に重ね、CSS に中身の幅として決めさせる
 * （フォントや文字の幅をコードで見積もらずに済み、どの行も同じ幅になる）。
 * 桁は `MarkedRow` が揃えるので、ここは帳簿と同じ右寄せだけを足す。
 */
function Amount({ amount, widest }: { amount: number; widest: string }) {
  return (
    <Typography
      variant="body2"
      component="div"
      sx={{ display: 'grid', justifyItems: 'end', '& > *': { gridArea: '1 / 1' } }}
    >
      <span aria-hidden style={{ visibility: 'hidden' }}>
        {widest}
      </span>
      <span>{formatYen(amount)}</span>
    </Typography>
  );
}

/** 読んだ記録（今日までと未来の両方）の中で一番幅を取る金額の表示。数字は等幅なので文字数で比べる */
function widestAmount(expenses: Expense[] = []): string {
  return expenses
    .map((e) => formatYen(e.amount))
    .reduce((a, b) => (b.length > a.length ? b : a), '');
}

type Props = Omit<HistoryListProps<Expense>, 'children'> & {
  /** 行を押したとき。editing は長押し（編集で開く）か */
  onSelect: (expense: Expense, editing: boolean) => void;
};

/**
 * 立替の履歴（上が古く下が新しい）。最初に出す位置は `HistoryList` が決め、上へスクロールすると古いほうのページを
 * 読み足す（`useExpenseHistory`、`HistoryList`）。使った日ごとに見出しを立て、その下に 1 件 1 行で並べる。
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
  const widest = useMemo(() => widestAmount(items), [items]);
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
                  lead={<Amount amount={expense.amount} widest={widest} />}
                >
                  <Typography sx={{ overflowWrap: 'anywhere' }}>{expense.description}</Typography>
                  <Typography variant="caption" color="textSecondary" component="div" noWrap>
                    {people.map(label).join(PARTIES_SEPARATOR)}
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
