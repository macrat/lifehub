import type { MemoInput } from '../../../shared/validation/memos.ts';
import { write } from '../../lib/api.ts';
import { signedInUserId } from '../../lib/auth.ts';
import { useCreateMutation, useOptimisticMutation } from '../../lib/query-client.ts';
import { TIMELINE_QUERY_KEY, timelineRecordCache } from '../timeline/queries.ts';

/** メモの形はサーバーと共有する（shared/memos.ts） */
export type { Memo } from '../../../shared/memos.ts';

/** メモを読むのはタイムラインだけなので、書き込みが変えるのもタイムラインだけ */
const WRITE_KEYS = [TIMELINE_QUERY_KEY];

/** タイムラインへの先回りの読み書き（メモを読む画面の履歴は無い） */
const memoCache = timelineRecordCache('memo');

export function useAddMemo() {
  return useCreateMutation<MemoInput>({
    request: write.memos.create,
    keys: WRITE_KEYS,
    apply: (client, { id, body }) => {
      // 画面から書くのはログイン中の人（サーバーもセッションのユーザーを書いた人にする）。
      // まだ手元に無ければ分からないまま先に出し、取り直しで埋まる
      const createdBy = signedInUserId(client);
      memoCache.apply(client, id, { id, body, createdBy, createdAt: new Date().toISOString() });
    },
  });
}

export function useUpdateMemo() {
  return useOptimisticMutation({
    request: write.memos.update,
    keys: WRITE_KEYS,
    apply: (client, { id, body }) => {
      const prev = memoCache.find(client, id);
      if (prev) memoCache.apply(client, id, { ...prev, body });
    },
  });
}

export function useDeleteMemo() {
  return useOptimisticMutation({
    request: (id: string) => write.memos.delete({ id }),
    keys: WRITE_KEYS,
    apply: (client, id) => memoCache.apply(client, id, null),
  });
}
