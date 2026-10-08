import type { ReactNode } from 'react';
import { EdgeSentinel } from './EdgeSentinel.tsx';
import type { EdgeLoader } from './loading-edge.ts';
import { ScrollAwayHeader } from './ScrollAwayHeader.tsx';
import { type ListPositionOptions, useListPosition } from './use-list-position.ts';

/** 一覧の上に貼り付けておく物とその出し方。一覧を包む部品（`HistoryList` など）はこれをそのまま受けて渡す */
export type InfiniteScrollHeaderProps = {
  /** 一覧の上に貼り付けておく物（絞り込みのフォーム、精算のタイルなど） */
  header?: ReactNode;
  /** 下へスクロールしている間は header を隠す（`ScrollAwayHeader`）。false なら常に出しておく */
  headerScrollsAway?: boolean;
};

type Props = InfiniteScrollHeaderProps &
  ListPositionOptions & {
    children: ReactNode;
    /**
     * 続きを読み足す端と、その端に近づいたときに読む物（`EdgeLoader`。今は読む物が無ければ null）。
     * top は上へ（古いほうを）、bottom は下へ読み足す。書かなかった端では読み足さず、引っ張って更新で引ける端になる。
     * 読む物は null か関数で、undefined は書けない（読み込み中に undefined を渡すと、読み足さない端に化けるため）
     */
    load: { top: EdgeLoader } | { bottom: EdgeLoader } | { top: EdgeLoader; bottom: EdgeLoader };
  };

/**
 * 端に近づくと続きを読む一覧。画面（window）そのものをスクロールする。
 * - 端の見張りは `EdgeSentinel`。読み込み中は読む物を null にすることで、二重に読まない
 * - 最初の位置と、前に足しても見ている所を動かさない仕掛けは `useListPosition`
 * - 引っ張って更新は、続きを読み足す端（load に書いた端）からは引けない（`EdgeSentinel` の印）
 */
export function InfiniteScroll({
  header,
  headerScrollsAway = false,
  children,
  load,
  ...position
}: Props) {
  const { headerRef, listRef } = useListPosition(position);
  return (
    <>
      <ScrollAwayHeader ref={headerRef} pinned={!headerScrollsAway}>
        {header}
      </ScrollAwayHeader>
      {'top' in load && <EdgeSentinel edge="top" onReach={load.top} />}
      <div ref={listRef}>{children}</div>
      {'bottom' in load && <EdgeSentinel edge="bottom" onReach={load.bottom} />}
    </>
  );
}
