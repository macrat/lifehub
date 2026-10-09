import { queryOptions } from '@tanstack/react-query';
import { type ApiOutputs, api, write } from '../../lib/api.ts';
import { putById } from '../../lib/list.ts';
import { useIssueMutation, useOptimisticMutation } from '../../lib/mutation.ts';

/** 記録投入用の API キー（[docs/features/api-keys.md](../../../docs/features/api-keys.md)） */
export type ApiKey = ApiOutputs['apiKeys']['list'][number];

export const apiKeysQueryOptions = queryOptions({
  queryKey: ['api-keys'],
  queryFn: ({ signal }) => api.apiKeys.list.query(undefined, { signal }),
});

/** 発行。キーを見られるのは発行の応答だけ（`useIssueMutation`） */
export function useCreateApiKey() {
  return useIssueMutation({
    request: api.apiKeys.create.mutate,
    queryKey: apiKeysQueryOptions.queryKey,
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
      client.setQueryData(apiKeysQueryOptions.queryKey, (keys) => keys && putById(keys, id, null));
    },
  });
}
