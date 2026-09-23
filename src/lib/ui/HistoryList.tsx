import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import type { useHistory } from '../history.ts';
import { InfiniteScroll } from './InfiniteScroll.tsx';
import { ListSkeleton, QueryView } from './QueryView.tsx';

type Props<T> = {
  /** 読んだ分の記録（古い順）と、上の端での読み足しなど（`useHistory`） */
  history: ReturnType<typeof useHistory<T, object>>;
  /** 一覧の上に貼り付けておく物（絞り込みのフォームなど） */
  header: ReactNode;
  /** 1 件も無いときの文言。検索で 0 件なのか、まだ 1 件も無いのかは画面が判断する */
  emptyMessage: string;
  /** 記録の並び（古い順）の描き方 */
  children: (items: T[]) => ReactNode;
};

/**
 * 履歴（立替・レモンの記録）の一覧の入れ物。上が古く下が新しく、最初は一番下（最新）を出し、
 * 上へスクロールすると古いほうのページを読み足す（`useHistory`、`InfiniteScroll`）。
 * 読み込み中・失敗・0 件の出し方をここに置き、中身の行の描き方だけを画面ごとに渡す。
 */
export function HistoryList<T>({ history, header, emptyMessage, children }: Props<T>) {
  return (
    <InfiniteScroll
      header={header}
      onReachStart={history.loadEarlier}
      resetKey={history.resetKey}
      ready={history.ready}
    >
      <QueryView query={history.query} skeleton={<ListSkeleton />}>
        {(items) =>
          items.length === 0 ? (
            <Typography color="text.secondary" sx={{ px: 2, py: 2 }}>
              {emptyMessage}
            </Typography>
          ) : (
            children(items)
          )
        }
      </QueryView>
    </InfiniteScroll>
  );
}
