import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiKeyInput } from '../../../shared/validation/api-keys.ts';
import { type ApiOutputs, api, write } from '../../lib/api.ts';
import { useOptimisticMutation } from '../../lib/mutation.ts';

/** 記録投入用の API キー（[docs/features/api-keys.md](../../../docs/features/api-keys.md)） */
export type ApiKey = ApiOutputs['apiKeys']['list'][number];

/** 発行した直後の API キー。キーそのものを見られるのはこのときだけ */
export type IssuedApiKey = ApiOutputs['apiKeys']['create'];

export const apiKeysQueryOptions = queryOptions({
  queryKey: ['api-keys'],
  queryFn: ({ signal }) => api.apiKeys.list.query(undefined, { signal }),
});

/**
 * 発行。発行したキーを画面に出すために応答の本文が要るので、書き込みの共通の mutation
 * （`useOptimisticMutation`。応答を返さない）ではなく、応答を待って返す mutation にする。
 * オフラインでは溜めずにその場で失敗する（キーはサーバーが作るので、送れるまで出せるものが無い）。
 * 応答には一覧に出す項目がすべて載っているので、一覧は取り直さずに末尾（作成日時の昇順）へ足す。
 * キーそのものは一覧に入れない（キャッシュは端末の IndexedDB に残るので、秘密を置かない）。
 */
export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ApiKeyInput): Promise<IssuedApiKey> => api.apiKeys.create.mutate(input),
    networkMode: 'always',
    onSuccess: ({ key: _key, ...apiKey }) => {
      queryClient.setQueryData(apiKeysQueryOptions.queryKey, (keys) => keys && [...keys, apiKey]);
    },
  });
}

/**
 * 失効。配信 URL と揃えてオフラインでは溜めない。
 * 「もう使えない」ことを確かめたい操作なので、送れたかどうかが分からないまま消えて見えるのは困る。
 */
export function useRevokeApiKey() {
  return useOptimisticMutation({
    request: (id: string) => write.apiKeys.revoke({ id }),
    queue: false,
    keys: [apiKeysQueryOptions.queryKey],
    apply: (client, id) => {
      client.setQueryData(apiKeysQueryOptions.queryKey, (keys) =>
        keys?.filter((key) => key.id !== id),
      );
    },
  });
}
