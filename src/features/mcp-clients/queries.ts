import { queryOptions } from '@tanstack/react-query';
import { type ApiOutputs, api, write } from '../../lib/api.ts';
import { putById } from '../../lib/list.ts';
import { useOptimisticMutation } from '../../lib/mutation.ts';

/** 接続を許可した MCP クライアント（[docs/features/mcp-clients.md](../../../docs/features/mcp-clients.md)） */
export type McpClient = ApiOutputs['mcpClients']['list'][number];

export const mcpClientsQueryOptions = queryOptions({
  queryKey: ['mcp-clients'],
  queryFn: ({ signal }) => api.mcpClients.list.query(undefined, { signal }),
});

/**
 * 失効。API キーと揃えてオフラインでは溜めない。
 * 「もう使えない」ことを確かめたい操作なので、送れたかどうかが分からないまま消えて見えるのは困る。
 */
export function useRevokeMcpClient() {
  return useOptimisticMutation({
    request: (id: string) => write.mcpClients.revoke({ id }),
    queue: false,
    keys: [mcpClientsQueryOptions.queryKey],
    apply: (client, id) => {
      client.setQueryData(
        mcpClientsQueryOptions.queryKey,
        (clients) => clients && putById(clients, id, null),
      );
    },
  });
}
