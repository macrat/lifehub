import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import type { QueryState } from '../query-client.ts';

type Props<T> = {
  query: QueryState<T>;
  /** データが来るまでの代わり。届いたときに位置が動かないよう、中身と同じ形・高さにする */
  skeleton: ReactNode;
  children: (data: T) => ReactNode;
};

/**
 * クエリ 1 つ分の表示。画面の移動はデータを待たない（ルートに loader を置かない）ので、
 * 待っている間と失敗したときの表示は画面の中に持つ。
 * 手元にデータがあれば取り直し中でも失敗してもそれを出す（キャッシュが空になることはないため、
 * 一度出た内容が読み込みや通信の失敗で消えない）。
 */
export function QueryView<T>({ query, skeleton, children }: Props<T>) {
  if (query.data !== undefined) return children(query.data);
  if (query.error)
    return (
      <Typography variant="body2" color="error" sx={{ px: 2, py: 1 }}>
        {query.error.message}
      </Typography>
    );
  return skeleton;
}

/** 設定画面の行 1 つ分の骨組み（名前と説明の 2 段）。発行した URL やキーの一覧が届くまで出す */
export function ListItemSkeleton() {
  return (
    <ListItem>
      <ListItemText primary={<Skeleton width="40%" />} secondary={<Skeleton width="60%" />} />
    </ListItem>
  );
}

/** 一覧が届くまでの骨組み。行数は空白を埋めるためだけのものなので、中身と合っている必要はない */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <List disablePadding aria-busy>
      {Array.from({ length: rows }, (_, i) => `row-${i}`).map((key) => (
        <ListItem key={key} divider>
          <ListItemText primary={<Skeleton width="60%" />} secondary={<Skeleton width="35%" />} />
        </ListItem>
      ))}
    </List>
  );
}
