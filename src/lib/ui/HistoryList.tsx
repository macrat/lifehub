import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { type ReactNode, useRef } from 'react';
import { today } from '../../../shared/date.ts';
import type { useHistory } from '../history.ts';
import { InfiniteScroll } from './InfiniteScroll.tsx';
import { BOTTOM_NAV_HEIGHT } from './layout.ts';
import { ListSkeleton, QueryView } from './QueryView.tsx';

/** 今日までの記録の下端を置く所。スマホは下部ナビのすぐ上、PC は画面の下端 */
const PAST_SX = {
  scrollMarginBottom: { xs: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`, md: 0 },
} as const;

type Props<T> = {
  /** 読んだ分の記録（古い順）と、上の端での読み足しなど（`useHistory`） */
  history: ReturnType<typeof useHistory<T, object>>;
  /** 一覧の上に貼り付けておく物（絞り込みのフォームなど） */
  header: ReactNode;
  /** 1 件も無いときの文言。検索で 0 件なのか、まだ 1 件も無いのかは画面が判断する */
  emptyMessage: string;
  /** 記録の並び（古い順）の描き方。今日までの記録と未来の記録で 1 回ずつ呼ぶ */
  children: (items: T[]) => ReactNode;
};

/**
 * 履歴（立替・レモンの記録）の一覧の入れ物。上が古く下が新しく、上へスクロールすると古いほうのページを
 * 読み足す（`useHistory`、`InfiniteScroll`）。
 * 最初は今日の最後の記録を画面の一番下（下部ナビのすぐ上）に出す。未来の日付の記録（先の予定として
 * 付けた立替など）はその下に続け、スクロールしないと見えないようにする: 開いたときに見たいのは
 * 今日までに起きたことで、未来の物が一番下にあると今日の記録が押し上げられて隠れる。
 * 今日と未来の境は描く中身から探さず、記録の日（`dayOf`）で分けて別々に描く（画面ごとの描き方に
 * 目印を付けて回らなくて済む）。
 * 読み込み中・失敗・0 件の出し方をここに置き、中身の行の描き方だけを画面ごとに渡す。
 */
export function HistoryList<T>({ history, header, emptyMessage, children }: Props<T>) {
  const pastRef = useRef<HTMLDivElement>(null);
  return (
    <InfiniteScroll
      header={header}
      onReachStart={history.loadEarlier}
      initialEnd={() => pastRef.current}
      resetKey={history.resetKey}
      ready={history.ready}
    >
      <QueryView query={history.query} skeleton={<ListSkeleton />}>
        {(items) => {
          if (items.length === 0)
            return (
              <Typography color="text.secondary" sx={{ px: 2, py: 2 }}>
                {emptyMessage}
              </Typography>
            );
          const until = today();
          const past = items.filter((item) => history.dayOf(item) <= until);
          const future = items.filter((item) => history.dayOf(item) > until);
          return (
            <>
              <Box ref={pastRef} sx={PAST_SX}>
                {past.length > 0 && children(past)}
              </Box>
              {future.length > 0 && children(future)}
            </>
          );
        }}
      </QueryView>
    </InfiniteScroll>
  );
}
