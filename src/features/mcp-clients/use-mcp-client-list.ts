import { useStoreQuery } from '../../lib/screen-data.ts';
import { type McpClient, mcpClientsQueryOptions, useRevokeMcpClient } from './queries.ts';

/** 設定画面の MCP クライアントの一覧（`McpClientList`）の状態と操作。失効は確かめてから送る */
export function useMcpClientList() {
  const clientsQuery = useStoreQuery(mcpClientsQueryOptions);
  const revokeClient = useRevokeMcpClient();

  return {
    clientsQuery,
    revoke: (client: McpClient) => {
      if (
        !window.confirm(
          `「${client.name}」（${client.site}）の接続を失効しますか？このアプリからは LifeHub を使えなくなります。`,
        )
      )
        return;
      revokeClient.mutate(client.id);
    },
  };
}
