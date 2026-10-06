import Box from '@mui/material/Box';
import { type ReactNode, useRef } from 'react';
import type { ScreenHistory } from '../screen-data.ts';
import { InfiniteScroll, type InfiniteScrollHeaderProps } from './InfiniteScroll.tsx';
import { MAIN_BOTTOM_PADDING, STICKY_TOP } from './layout.ts';
import { EmptyMessage, ListSkeleton, QueryView } from './QueryView.tsx';

/** 画面ごとの一覧（`MoneyList` など）は、行の描き方（children）以外をこのまま受けて渡す */
export type HistoryListProps<T> = InfiniteScrollHeaderProps & {
  /** 読んだ分の記録（画面に出す順に、最初の位置より上と、そこから下に分けた物）と、古い側の端での読み足しなど（画面が購読した `useScreenHistory`） */
  history: ScreenHistory<T>;
  /** 1 件も無いときの文言。検索で 0 件なのか、まだ 1 件も無いのかは画面が判断する */
  emptyMessage: string;
  /**
   * 記録の並び（画面に出す順。上から新しい順、出どころが `oldestFirst` なら古い順）の描き方。
   * 最初の位置より上の記録と、最初の位置から下の記録で 1 回ずつ呼ぶ
   */
  children: (items: T[]) => ReactNode;
  /** 開いたときに必ず画面に収める行（`InfiniteScroll` の initial.reveal）。最初の位置から最小限だけ動かす */
  reveal?: (list: HTMLElement) => HTMLElement | null;
};

/**
 * 最初の位置から下の部分の高さの下限。そこから下が画面より短くても最初の位置を画面の一番上まで上げられるよう、
 * 画面の高さ（AppBar と、ページの下端の余白を除いた分）まで伸ばす
 */
const INITIAL_MIN_HEIGHT = {
  xs: `calc(100svh - ${STICKY_TOP} - ${MAIN_BOTTOM_PADDING.xs})`,
  md: `calc(100svh - ${STICKY_TOP} - ${MAIN_BOTTOM_PADDING.md})`,
};

/**
 * 履歴（立替・レモンの記録、天気）の一覧の入れ物。どちらの向きでも、最初は今日を画面の一番上（AppBar と
 * 貼り付けた物のすぐ下）に出し、古い側の端へ近づくと古いほうのページを読み足す（`useScreenHistory`、`InfiniteScroll`）。
 * - 立替・レモン: 上が新しく下が古い（ホームのタイムラインと同じ向き。最新を先に見たい画面なので）。最初は今日の
 *   最新の記録を一番上に出し、下の端で古いほうを読み足す。未来の日付の記録（先の予定として付けた立替など）は
 *   その上に置き、上へ戻らないと見えないようにする: 開いたときに見たいのは今日までに起きたことで、未来の物が
 *   一番上にあると今日の記録が押し下げられて隠れる
 * - 天気（出どころが `oldestFirst`）: 上が古く下が新しい。最初は今日を一番上に出し、その下に先の日を続ける
 *   （見たいのは今日から先で、過ぎた日は上へ戻って見る）。上の端で古いほうを読み足す
 * 最初の位置の境は描いた中身から探さず、`useScreenHistory` がデータで分けて並べた物を別々に描く（画面ごとの描き方に
 * 目印を付けて回らなくて済む）。
 * 読み込み中・失敗・0 件の出し方をここに置き、中身の行の描き方だけを画面ごとに渡す。
 * 引っ張って更新は、読み足す端の逆の端から引いて取り直す（読み足す端から引いても取り直さない。`EdgeSentinel` の印）。
 */
export function HistoryList<T>({
  history,
  emptyMessage,
  children,
  reveal,
  ...headerProps
}: HistoryListProps<T>) {
  const initialRef = useRef<HTMLDivElement>(null);
  return (
    <InfiniteScroll
      {...headerProps}
      load={history.load}
      initial={{ target: () => initialRef.current, reveal }}
      resetKey={history.resetKey}
      ready={history.ready}
    >
      <QueryView query={history.query} skeleton={<ListSkeleton />}>
        {({ items, above, below }) =>
          items.length === 0 ? (
            <EmptyMessage>{emptyMessage}</EmptyMessage>
          ) : (
            <>
              {above.length > 0 && children(above)}
              <Box
                ref={initialRef}
                sx={above.length > 0 ? { minHeight: INITIAL_MIN_HEIGHT } : undefined}
              >
                {below.length > 0 && children(below)}
              </Box>
            </>
          )
        }
      </QueryView>
    </InfiniteScroll>
  );
}
