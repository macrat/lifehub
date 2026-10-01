import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { type ReactNode, useRef } from 'react';
import type { ScreenHistory } from '../screen-data.ts';
import { InfiniteScroll, type InfiniteScrollHeaderProps } from './InfiniteScroll.tsx';
import { MAIN_BOTTOM_PADDING, STICKY_TOP } from './layout.ts';
import { ListSkeleton, QueryView } from './QueryView.tsx';

/** 画面ごとの一覧（`ExpenseList` など）は、行の描き方（children）以外をこのまま受けて渡す */
export type HistoryListProps<T> = InfiniteScrollHeaderProps & {
  /** 読んだ分の記録（今日までと未来、どちらも古い順）と、上の端での読み足しなど（画面が購読した `useScreenHistory`） */
  history: ScreenHistory<T>;
  /** 1 件も無いときの文言。検索で 0 件なのか、まだ 1 件も無いのかは画面が判断する */
  emptyMessage: string;
  /** 記録の並び（古い順）の描き方。今日までの記録と未来の記録で 1 回ずつ呼ぶ */
  children: (items: T[]) => ReactNode;
  /** 開いたときに必ず画面に収める行（`InfiniteScroll` の initial.reveal）。最初の位置から最小限だけ動かす */
  reveal?: (list: HTMLElement) => HTMLElement | null;
};

/**
 * 今日から先の部分の高さの下限（`todayAtTop`）。今日から先が画面より短くても今日を画面の一番上まで上げられるよう、
 * 画面の高さ（AppBar と、ページの下端の余白を除いた分）まで伸ばす
 */
const FUTURE_MIN_HEIGHT = {
  xs: `calc(100svh - ${STICKY_TOP} - ${MAIN_BOTTOM_PADDING.xs})`,
  md: `calc(100svh - ${STICKY_TOP} - ${MAIN_BOTTOM_PADDING.md})`,
};

/**
 * 履歴（立替・レモンの記録、天気）の一覧の入れ物。上が古く下が新しく、上へスクロールすると古いほうのページを
 * 読み足す（`useScreenHistory`、`InfiniteScroll`）。
 * 最初は今日の最後の記録を画面の一番下（スマホは下部ナビのすぐ上）に出す。未来の日付の記録（先の予定として
 * 付けた立替など）はその下に続け、スクロールしないと見えないようにする: 開いたときに見たいのは
 * 今日までに起きたことで、未来の物が一番下にあると今日の記録が押し上げられて隠れる。
 * ただし出どころが `todayAtTop`（天気）なら、今日を画面の一番上に出し、その下に先の日を続ける
 * （見たいのは今日から先で、過ぎた日は上へ戻って見る）。
 * 今日と未来の境は描いた中身から探さず、`useScreenHistory` がデータで分けた物を別々に描く（画面ごとの描き方に
 * 目印を付けて回らなくて済む）。
 * 読み込み中・失敗・0 件の出し方をここに置き、中身の行の描き方だけを画面ごとに渡す。
 * 引っ張って更新は、読み足す上端の逆の下端から上へ引いて取り直す（上端から引いても取り直さない。`EdgeSentinel` の印）。
 */
export function HistoryList<T>({
  history,
  emptyMessage,
  children,
  reveal,
  ...headerProps
}: HistoryListProps<T>) {
  const pastRef = useRef<HTMLDivElement>(null);
  const futureRef = useRef<HTMLDivElement>(null);
  return (
    <InfiniteScroll
      {...headerProps}
      load={{ top: history.loadEarlier }}
      initial={{
        ...(history.todayAtTop
          ? { block: 'start', target: () => futureRef.current }
          : { block: 'end', target: () => pastRef.current }),
        reveal,
      }}
      resetKey={history.resetKey}
      ready={history.ready}
    >
      <QueryView query={history.query} skeleton={<ListSkeleton />}>
        {({ past, future }) =>
          past.length === 0 && future.length === 0 ? (
            <Typography color="textSecondary" sx={{ px: 2, py: 2 }}>
              {emptyMessage}
            </Typography>
          ) : (
            <>
              <div ref={pastRef}>{past.length > 0 && children(past)}</div>
              {future.length > 0 && (
                <Box
                  ref={futureRef}
                  sx={history.todayAtTop ? { minHeight: FUTURE_MIN_HEIGHT } : undefined}
                >
                  {children(future)}
                </Box>
              )}
            </>
          )
        }
      </QueryView>
    </InfiniteScroll>
  );
}
