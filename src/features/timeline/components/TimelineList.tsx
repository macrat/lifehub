import Typography from '@mui/material/Typography';
import { useEffect, useRef } from 'react';
import { ListSkeleton, QueryView } from '../../../lib/ui/QueryView.tsx';
import { useEdgeObserver } from '../../../lib/ui/use-edge-observer.ts';
import type { TimelineEntry, useTimeline } from '../queries.ts';
import { TimelineRow } from './TimelineRow.tsx';

type Props = {
  /** 読んだ分の行（古い順）と、下の端での読み足しなど（`useTimeline`） */
  timeline: ReturnType<typeof useTimeline>;
  /** 1 件も無いときの文言。検索で 0 件なのか、まだ 1 件も無いのかは画面が判断する */
  emptyMessage: string;
  /** 行を押したとき。editing は長押し（編集で開く）か */
  onSelect: (entry: TimelineEntry, editing: boolean) => void;
};

/**
 * タイムライン。上が新しく下が古く、下の端へ近づくと古いほうのページを読み足す（`useEdgeObserver`）。
 * 立替・レモンの履歴（`HistoryList`）とは上下が逆で、足すのはいつも下なので、見ている所を保つ仕掛けは要らない。
 * 絞り込みを変えたら一番上（最新）へ戻す。
 */
export function TimelineList({ timeline, emptyMessage, onSelect }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  useEdgeObserver(endRef, timeline.loadEarlier);
  useScrollToTopOnReset(timeline.resetKey);
  return (
    <>
      <QueryView query={timeline.query} skeleton={<ListSkeleton />}>
        {({ past, future }) =>
          past.length + future.length === 0 ? (
            <Typography color="text.secondary" sx={{ px: 2, py: 2 }}>
              {emptyMessage}
            </Typography>
          ) : (
            // 履歴は今日までと未来に分けて返る（立替・レモンの最初の位置のため）。タイムラインは
            // 分けずに 1 本で出すので、繋ぎ直して逆さ（新しい順）にする
            [...past, ...future]
              .toReversed()
              .map((entry) => <TimelineRow key={entry.id} entry={entry} onSelect={onSelect} />)
          )
        }
      </QueryView>
      <div ref={endRef} />
    </>
  );
}

/** 別の一覧になったら（絞り込みを変えたら）一番上へ。最初に出したときは触らない（戻ってきた位置を保つ） */
function useScrollToTopOnReset(resetKey: string) {
  const previous = useRef(resetKey);
  useEffect(() => {
    if (previous.current === resetKey) return;
    previous.current = resetKey;
    window.scrollTo(0, 0);
  }, [resetKey]);
}
