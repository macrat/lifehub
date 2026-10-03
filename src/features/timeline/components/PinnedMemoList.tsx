import { useMemo } from 'react';
import { memoEntry } from '../../../../shared/timeline.ts';
import { useStoreQuery } from '../../../lib/screen-data.ts';
import { pinnedMemosQueryOptions } from '../../memos/queries.ts';
import type { TimelineEntry } from '../queries.ts';
import { TimelineRow } from './TimelineRow.tsx';

type Props = {
  /** 行を押したとき。editing は長押し（編集で開く）か */
  onSelect: (entry: TimelineEntry, editing: boolean) => void;
};

/**
 * タイムラインの一番上に固定する、ピン止めしたメモ（書いた時刻の新しい順）。行はタイムラインと同じ
 * （`TimelineRow`）で、日時の右のピンで固定していると分かる。絞り込んでいないときだけ画面が出し、購読する。
 * 届くまでは何も出さない。WHY NOT 骨組みを出す: ピン止めは無いことが多く、届いたときに骨組みが消えて
 * 下のタイムラインの位置が動く（タイムラインは自分の骨組みを出している）。
 */
export function PinnedMemoList({ onSelect }: Props) {
  const { data } = useStoreQuery(pinnedMemosQueryOptions);
  // 行は記録が変わらない限り描き直さない（`TimelineRow` は memo）ので、行の形は届いた値が変わったときだけ作る
  const entries = useMemo(() => data?.map(memoEntry) ?? [], [data]);
  return entries.map((entry) => <TimelineRow key={entry.id} entry={entry} onSelect={onSelect} />);
}
