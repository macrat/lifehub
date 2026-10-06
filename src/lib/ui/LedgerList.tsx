import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import type { DateString } from '../../../shared/types.ts';
import { DateHeading } from './DateHeading.tsx';
import { HistoryList, type HistoryListProps } from './HistoryList.tsx';
import { MarkedRow } from './MarkedRow.tsx';
import { VennMark } from './VennMark.tsx';

/** 印の枠の幅。印（`VennMark`）は見せるだけで押せないので、枠を印の大きさぴったりにして金額との間を空けない */
const MARK_WIDTH = 20;

export type LedgerListProps<T extends { id: string }> = Omit<HistoryListProps<T>, 'children'> & {
  /** 記録の日（JST の暦日）。この日ごとに見出しを立てる */
  dayOf: (item: T) => DateString;
  /** 金額の表示。読んだ記録が変わるたびに全件に掛けて列の幅を決めるので、描くたびに作り直さない関数を渡す */
  amountOf: (item: T) => string;
  /** 印（ベン図）の色。人の色、誰のものでもなければ無彩色 */
  markColorsOf: (item: T) => string[];
  /** 本文の上（内容）と下（補足） */
  titleOf: (item: T) => string;
  captionOf: (item: T) => string;
  /** 行を押したとき。editing は長押し（編集で開く）か */
  onSelect: (item: T, editing: boolean) => void;
};

/**
 * お金の記録（立替・入出金）の履歴。上が新しく下が古い無限スクロールで、日ごとに見出しを立て、その下に 1 件 1 行で並べる
 * （日も行も `HistoryList` が渡す順のまま）。体裁はカレンダーのリスト表示と同じ（`DateHeading` と `MarkedRow`）で、
 * 印はベン図、主列は金額、本文は内容と補足。
 * 金額の列の幅は、読んだ記録の中で一番幅を取る金額に合わせる: 決め打ちの幅だと、普段の数千円の記録にまれな 6 桁が
 * 収まる幅を取り続けて本文が狭くなる。幅は測らず、一番幅を取る金額を透明にして同じ升目に重ね、CSS に中身の幅として
 * 決めさせる（フォントや文字の幅をコードで見積もらずに済み、どの行も同じ幅になる）。桁は `MarkedRow` が揃えるので、
 * ここは帳簿と同じ右寄せだけを足す。
 */
export function LedgerList<T extends { id: string }>({
  dayOf,
  amountOf,
  markColorsOf,
  titleOf,
  captionOf,
  onSelect,
  ...listProps
}: LedgerListProps<T>) {
  const items = listProps.history.query.data?.items;
  // 読んだ記録が増えるほど重くなるので、記録が変わったときだけ求め直す。数字は等幅なので文字数で比べる
  const widest = useMemo(
    () => (items ?? []).map(amountOf).reduce((a, b) => (b.length > a.length ? b : a), ''),
    [items, amountOf],
  );
  return (
    <HistoryList {...listProps}>
      {(records) =>
        [...Map.groupBy(records, dayOf)].map(([date, sameDay]) => (
          <Box key={date} sx={{ pb: 1 }}>
            <DateHeading date={date} />
            {sameDay.map((record) => (
              <MarkedRow
                key={record.id}
                moveKey={record.id}
                onSelect={(editing) => onSelect(record, editing)}
                mark={<VennMark colors={markColorsOf(record)} />}
                markWidth={MARK_WIDTH}
                lead={
                  <Typography
                    variant="body2"
                    component="div"
                    sx={{ display: 'grid', justifyItems: 'end', '& > *': { gridArea: '1 / 1' } }}
                  >
                    <span aria-hidden style={{ visibility: 'hidden' }}>
                      {widest}
                    </span>
                    <span>{amountOf(record)}</span>
                  </Typography>
                }
              >
                <Typography sx={{ overflowWrap: 'anywhere' }}>{titleOf(record)}</Typography>
                <Typography variant="caption" color="textSecondary" component="div" noWrap>
                  {captionOf(record)}
                </Typography>
              </MarkedRow>
            ))}
          </Box>
        ))
      }
    </HistoryList>
  );
}
