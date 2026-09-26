import Typography from '@mui/material/Typography';
import { type ReactNode, useRef } from 'react';
import type { useHistory } from '../history.ts';
import { InfiniteScroll, type InfiniteScrollHeaderProps } from './InfiniteScroll.tsx';
import { ListSkeleton, QueryView } from './QueryView.tsx';

/** 画面ごとの一覧（`ExpenseList` など）は、行の描き方（children）以外をこのまま受けて渡す */
export type HistoryListProps<T> = InfiniteScrollHeaderProps & {
  /** 読んだ分の記録（今日までと未来、どちらも古い順）と、上の端での読み足しなど（`useHistory`） */
  history: ReturnType<typeof useHistory<T, object>>;
  /** 1 件も無いときの文言。検索で 0 件なのか、まだ 1 件も無いのかは画面が判断する */
  emptyMessage: string;
  /** 記録の並び（古い順）の描き方。今日までの記録と未来の記録で 1 回ずつ呼ぶ */
  children: (items: T[]) => ReactNode;
};

/**
 * 履歴（立替・レモンの記録）の一覧の入れ物。上が古く下が新しく、上へスクロールすると古いほうのページを
 * 読み足す（`useHistory`、`InfiniteScroll`）。
 * 最初は今日の最後の記録を画面の一番下（スマホは下部ナビのすぐ上）に出す。未来の日付の記録（先の予定として
 * 付けた立替など）はその下に続け、スクロールしないと見えないようにする: 開いたときに見たいのは
 * 今日までに起きたことで、未来の物が一番下にあると今日の記録が押し上げられて隠れる。
 * 今日と未来の境は描いた中身から探さず、`useHistory` がデータで分けた物を別々に描く（画面ごとの描き方に
 * 目印を付けて回らなくて済む）。
 * 読み込み中・失敗・0 件の出し方をここに置き、中身の行の描き方だけを画面ごとに渡す。
 * 引っ張って更新は上端からに加えて、最新を見ている下端から上へ引いても取り直せる。
 */
export function HistoryList<T>({
  history,
  emptyMessage,
  children,
  ...headerProps
}: HistoryListProps<T>) {
  const pastRef = useRef<HTMLDivElement>(null);
  return (
    <InfiniteScroll
      {...headerProps}
      onReachStart={history.loadEarlier}
      initial={{ block: 'end', target: () => pastRef.current }}
      resetKey={history.resetKey}
      ready={history.ready}
      pullToRefresh={['top', 'bottom']}
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
              {future.length > 0 && children(future)}
            </>
          )
        }
      </QueryView>
    </InfiniteScroll>
  );
}
