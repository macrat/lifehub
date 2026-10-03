import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { type Memo, sortPinnedMemos } from '../../../shared/memos.ts';
import type { MemoInput } from '../../../shared/validation/memos.ts';
import { api, write } from '../../lib/api.ts';
import { signedInUserId } from '../../lib/auth.ts';
import { useCreateMutation, useOptimisticMutation } from '../../lib/query-client.ts';
import { TIMELINE_QUERY_KEY, timelineRecordCache } from '../timeline/queries.ts';

/** メモの形はサーバーと共有する（shared/memos.ts） */
export type { Memo } from '../../../shared/memos.ts';

const MEMOS_QUERY_KEY = ['memos'] as const;

/** ピン止めしたメモ（書いた時刻の新しい順）。ホームがタイムラインの一番上に固定して出す */
export const pinnedMemosQueryOptions = queryOptions({
  queryKey: [...MEMOS_QUERY_KEY, 'pinned'],
  queryFn: ({ signal }): Promise<Memo[]> => api.memos.pinned.query(undefined, { signal }),
});

/** メモを読むのはタイムラインとピン止めの並びだけなので、書き込みが変えるのもその 2 つだけ */
const WRITE_KEYS = [TIMELINE_QUERY_KEY, MEMOS_QUERY_KEY];

/** タイムラインへの先回りの読み書き（メモを読む画面の履歴は無い） */
const memoCache = timelineRecordCache('memo');

/** 手元の控えにあるメモ（編集・削除の前の値）。ピン止めしたものはタイムラインに無いので、先にピン止めの並びを見る */
function findMemo(client: QueryClient, id: string): Memo | undefined {
  const pinned = client.getQueryData(pinnedMemosQueryOptions.queryKey);
  return pinned?.find((memo) => memo.id === id) ?? memoCache.find(client, id);
}

/**
 * メモ 1 件の変化（id のメモが next になる。削除は null）を、手元の控えに先回りして書き込む。
 * サーバーと同じく、ピン止めしたメモはピン止めの並びにだけ、ほかはタイムラインにだけ置く
 * （`server/features/timeline/service.ts` の `getTimelinePage`）。絞り込んだタイムラインはピン止めしたメモも
 * 書いた時刻の位置に出すが、どの書き込みでも絞り込んだ控えからは除いて取り直しに任せる（`applyToHistories`）ので、
 * ここで分ける必要は無い。
 */
function applyMemo(client: QueryClient, id: string, next: Memo | null): void {
  client.setQueryData(
    pinnedMemosQueryOptions.queryKey,
    (memos) =>
      memos &&
      sortPinnedMemos([...memos.filter((memo) => memo.id !== id), ...(next?.pinned ? [next] : [])]),
  );
  memoCache.apply(client, id, next?.pinned ? null : next);
}

export function useAddMemo() {
  return useCreateMutation<MemoInput>({
    request: write.memos.create,
    keys: WRITE_KEYS,
    apply: (client, { id, body }) => {
      // 画面から書くのはログイン中の人（サーバーもセッションのユーザーを書いた人にする）。
      // まだ手元に無ければ分からないまま先に出し、取り直しで埋まる
      const createdBy = signedInUserId(client);
      applyMemo(client, id, {
        id,
        body,
        createdBy,
        createdAt: new Date().toISOString(),
        pinned: false,
      });
    },
  });
}

export function useUpdateMemo() {
  return useOptimisticMutation({
    request: write.memos.update,
    keys: WRITE_KEYS,
    apply: (client, { id, body }) => {
      const prev = findMemo(client, id);
      if (prev) applyMemo(client, id, { ...prev, body });
    },
  });
}

/** ピン止めする（pinned = true）か外す。ピン止めの並びとタイムラインの間を行が移る */
export function usePinMemo() {
  return useOptimisticMutation({
    request: write.memos.pin,
    keys: WRITE_KEYS,
    apply: (client, { id, pinned }) => {
      const prev = findMemo(client, id);
      if (prev) applyMemo(client, id, { ...prev, pinned });
    },
  });
}

export function useDeleteMemo() {
  return useOptimisticMutation({
    request: (id: string) => write.memos.delete({ id }),
    keys: WRITE_KEYS,
    apply: (client, id) => applyMemo(client, id, null),
  });
}
