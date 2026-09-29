import Typography from '@mui/material/Typography';
import { useLayoutEffect } from 'react';
import type { ScreenHistory } from '../../../lib/screen-data.ts';
import { EdgeSentinel } from '../../../lib/ui/EdgeSentinel.tsx';
import { ListSkeleton, QueryView } from '../../../lib/ui/QueryView.tsx';
import type { TimelineEntry } from '../queries.ts';
import { TimelineRow } from './TimelineRow.tsx';

type Props = {
  /** 読んだ分の行（古い順）と、下の端での読み足しなど（画面が購読した `useScreenHistory`） */
  timeline: ScreenHistory<TimelineEntry>;
  /** 1 件も無いときの文言。検索で 0 件なのか、まだ 1 件も無いのかは画面が判断する */
  emptyMessage: string;
  /** 行を押したとき。editing は長押し（編集で開く）か */
  onSelect: (entry: TimelineEntry, editing: boolean) => void;
};

/**
 * タイムライン。上が新しく下が古く、下の端へ近づくと古いほうのページを読み足す（`EdgeSentinel`）。
 * 立替・レモンの履歴（`HistoryList`）とは上下が逆で、足すのはいつも下なので、見ている所を保つ仕掛けは要らない。
 * 引っ張って更新は、読み足す下端の逆の上端からだけ引ける（`EdgeSentinel` の印）。
 * 最初の位置は一番上（最新）。開いたときと絞り込みを変えたときにそこへ置く（ルーターは位置に触らない。
 * ホームのルートの `staticData.ownsScroll`）。タブの再押下で戻る先も一番上で、それは
 * `scrollToInitialPosition` の既定なので、ここでは受け持たない。
 */
export function TimelineList({ timeline, emptyMessage, onSelect }: Props) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: キーは「別の一覧になった」合図で、値そのものは使わない
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [timeline.resetKey]);
  return (
    <>
      <QueryView query={timeline.query} skeleton={<ListSkeleton />}>
        {({ items }) =>
          items.length === 0 ? (
            <Typography color="textSecondary" sx={{ px: 2, py: 2 }}>
              {emptyMessage}
            </Typography>
          ) : (
            // タイムラインは今日で分けずに 1 本で出すので、全部を逆さ（新しい順）にする
            items
              .toReversed()
              .map((entry) => <TimelineRow key={entry.id} entry={entry} onSelect={onSelect} />)
          )
        }
      </QueryView>
      <EdgeSentinel edge="bottom" onReach={timeline.loadEarlier} />
    </>
  );
}
