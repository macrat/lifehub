import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import { partiesOf } from '../../../../shared/money.ts';
import { DateHeading } from '../../../lib/ui/DateHeading.tsx';
import { HistoryList, type HistoryListProps } from '../../../lib/ui/HistoryList.tsx';
import { MarkedRow } from '../../../lib/ui/MarkedRow.tsx';
import { formatSignedYen, formatYen } from '../../../lib/yen.ts';
import { useUserColor } from '../../users/use-user-color.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { partiesInOrder, partiesLabel } from '../parties.ts';
import type { MoneyRecord } from '../queries.ts';
import { PartiesMark } from './PartiesMark.tsx';

/** 印の枠の幅。印（`VennMark`）は見せるだけで押せないので、枠を印の大きさぴったりにして金額との間を空けない */
const MARK_WIDTH = 20;

/** 金額の表示。手で入れた立替は額だけ、取り込んだ入出金は入金に + を付ける */
function amountOf(record: MoneyRecord): string {
  return record.account === null ? formatYen(record.amount) : formatSignedYen(record.amount);
}

/**
 * 行の補足。手で入れた立替は当事者の名前（`partiesInOrder` の並び）、取り込んだ入出金は金融機関
 */
function captionOf(record: MoneyRecord, label: (party: string | null) => string): string {
  return record.account ?? partiesLabel(partiesInOrder(record), label);
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

type Props = Omit<HistoryListProps<MoneyRecord>, 'children'> & {
  /** 行を押したとき。editing は長押し（編集で開く）か */
  onSelect: (record: MoneyRecord, editing: boolean) => void;
};

/**
 * お金の画面の一覧: 立替と取り込んだ入出金を 1 本に並べた履歴（上が新しく下が古い）。最初に出す位置は `HistoryList` が決め、
 * 下へスクロールすると古いほうのページを読み足す（`moneyHistory` を画面が `useScreenHistory` で購読し、`HistoryList` で出す）。
 * 日ごとに見出しを立て、その下に 1 件 1 行で並べる（日も行も `HistoryList` が渡す順のまま）。
 * 体裁はカレンダーのリスト表示と同じ（`DateHeading` と `MarkedRow`）で、印はベン図、主列は金額、本文は内容と補足:
 * - 立替: 名前は共有なら払った人だけ、相手が決まっていれば簿記の並びで「To ← From」（`partiesInOrder`）。
 *   印も同じ並びで、共有のために払ったものは払った人 1 色の円、人から人へのものは左を To・右を From の円にする
 * - 取り込んだ入出金: 補足は金融機関。印は無彩色の点（人に結び付かない。タイムラインの丸も同じ色）。ルールで「共有」との
 *   立替にしたもの（当事者を持つもの）は、立替と同じ並びと色のベン図
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
      {(records) =>
        [...Map.groupBy(records, (record) => record.occurredOn)].map(([date, sameDay]) => (
          <Box key={date} sx={{ pb: 1 }}>
            <DateHeading date={date} />
            {sameDay.map((record) => (
              <MarkedRow
                key={record.id}
                moveKey={record.id}
                onSelect={(editing) => onSelect(record, editing)}
                mark={<PartiesMark parties={partiesOf(record)} colorFor={colorFor} />}
                markWidth={MARK_WIDTH}
                lead={<Amount text={amountOf(record)} widest={widest} />}
              >
                <Typography sx={{ overflowWrap: 'anywhere' }}>{record.description}</Typography>
                <Typography variant="caption" color="textSecondary" component="div" noWrap>
                  {captionOf(record, label)}
                </Typography>
              </MarkedRow>
            ))}
          </Box>
        ))
      }
    </HistoryList>
  );
}
