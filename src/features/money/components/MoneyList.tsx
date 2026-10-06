import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import { moneyEntryDay } from '../../../../shared/money.ts';
import { DateHeading } from '../../../lib/ui/DateHeading.tsx';
import { HistoryList, type HistoryListProps } from '../../../lib/ui/HistoryList.tsx';
import { MarkedRow } from '../../../lib/ui/MarkedRow.tsx';
import { formatSignedYen, formatYen } from '../../../lib/yen.ts';
import { PartiesMark } from '../../expenses/components/PartiesMark.tsx';
import { partiesInOrder, partiesLabel } from '../../expenses/parties.ts';
import { useUserColor } from '../../users/use-user-color.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import type { MoneyEntry } from '../queries.ts';

/** 印の枠の幅。印（`VennMark`）は見せるだけで押せないので、枠を印の大きさぴったりにして金額との間を空けない */
const MARK_WIDTH = 20;

/** 金額の表示。立替は額だけ、入出金は入金に + を付ける */
function amountOf(entry: MoneyEntry): string {
  return entry.type === 'expense'
    ? formatYen(entry.expense.amount)
    : formatSignedYen(entry.transaction.amount);
}

/**
 * 金額の列。列の幅は読んだ記録の中で一番幅を取る金額に合わせる（`widest`）: 決め打ちの幅だと、
 * 普段の数千円の記録にまれな 6 桁が収まる幅を取り続けて本文が狭くなる。
 * 幅は測らず、一番幅を取る金額を透明にして同じ升目に重ね、CSS に中身の幅として決めさせる
 * （フォントや文字の幅をコードで見積もらずに済み、どの行も同じ幅になる）。
 * 桁は `MarkedRow` が揃えるので、ここは帳簿と同じ右寄せだけを足す。
 */
function Amount({ text, widest }: { text: string; widest: string }) {
  return (
    <Typography
      variant="body2"
      component="div"
      sx={{ display: 'grid', justifyItems: 'end', '& > *': { gridArea: '1 / 1' } }}
    >
      <span aria-hidden style={{ visibility: 'hidden' }}>
        {widest}
      </span>
      <span>{text}</span>
    </Typography>
  );
}

type Props = Omit<HistoryListProps<MoneyEntry>, 'children'> & {
  /** 行を押したとき。editing は長押し（編集で開く）か */
  onSelect: (entry: MoneyEntry, editing: boolean) => void;
};

/**
 * お金の画面の一覧: 立替と取り込んだ入出金を 1 本に並べた履歴（上が新しく下が古い）。最初に出す位置は `HistoryList` が決め、
 * 下へスクロールすると古いほうのページを読み足す（`moneyHistory` を画面が `useScreenHistory` で購読し、`HistoryList` で出す）。
 * 日ごとに見出しを立て、その下に 1 件 1 行で並べる（日も行も `HistoryList` が渡す順のまま）。
 * 体裁はカレンダーのリスト表示と同じ（`DateHeading` と `MarkedRow`）で、印はベン図、主列は金額、本文は内容と補足:
 * - 立替: 名前は共有なら払った人だけ、相手が決まっていれば簿記の並びで「To ← From」（`partiesInOrder`）。
 *   印も同じ並びで、共有のために払ったものは払った人 1 色の円、人から人へのものは左を To・右を From の円にする
 * - 入出金: 補足は金融機関。印は無彩色の点（人に結び付かない。タイムラインの丸も同じ色）。ルールで「共有」との立替に
 *   したもの（`parties`）は、立替と同じ並びと色のベン図
 */
export function MoneyList({ onSelect, ...listProps }: Props) {
  const { label } = useUserLabels();
  const colorFor = useUserColor();
  const items = listProps.history.query.data?.items;
  // 読んだ記録が増えるほど重くなるので、記録が変わったときだけ求め直す。数字は等幅なので文字数で比べる
  const widest = useMemo(
    () => (items ?? []).map(amountOf).reduce((a, b) => (b.length > a.length ? b : a), ''),
    [items],
  );
  return (
    <HistoryList {...listProps}>
      {(entries) =>
        [...Map.groupBy(entries, moneyEntryDay)].map(([date, sameDay]) => (
          <Box key={date} sx={{ pb: 1 }}>
            <DateHeading date={date} />
            {sameDay.map((entry) => {
              const parties = entry.type === 'expense' ? entry.expense : entry.transaction.parties;
              const people = parties ? partiesInOrder(parties) : [];
              return (
                <MarkedRow
                  key={entry.id}
                  moveKey={entry.id}
                  onSelect={(editing) => onSelect(entry, editing)}
                  mark={<PartiesMark parties={parties} colorFor={colorFor} />}
                  markWidth={MARK_WIDTH}
                  lead={<Amount text={amountOf(entry)} widest={widest} />}
                >
                  <Typography sx={{ overflowWrap: 'anywhere' }}>
                    {entry.type === 'expense'
                      ? entry.expense.description
                      : entry.transaction.description}
                  </Typography>
                  <Typography variant="caption" color="textSecondary" component="div" noWrap>
                    {entry.type === 'expense'
                      ? partiesLabel(people, label)
                      : entry.transaction.account}
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
