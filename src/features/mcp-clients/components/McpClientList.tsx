import DeleteIcon from '@mui/icons-material/Delete';
import IconButton from '@mui/material/IconButton';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import { formatDateTime } from '../../../lib/date.ts';
import { ListItemSkeleton, QueryView } from '../../../lib/ui/QueryView.tsx';
import type { McpClient } from '../queries.ts';
import { useMcpClientList } from '../use-mcp-client-list.ts';

/**
 * 設定画面の「外部連携」の MCP クライアントの行。接続を許可した AI アプリなどを並べ、
 * 1 つずつ失効させる（[docs/features/mcp-clients.md](../../../../docs/features/mcp-clients.md)）。
 */
export function McpClientList() {
  const list = useMcpClientList();

  return (
    <>
      <ListItem>
        <ListItemText
          primary="MCP クライアント"
          secondary="接続を許可した AI アプリなど。接続はアプリの側から始める"
        />
      </ListItem>
      <QueryView query={list.clientsQuery} skeleton={<ListItemSkeleton />}>
        {(clients) =>
          clients.map((client) => (
            <ClientItem key={client.id} client={client} onRevoke={() => list.revoke(client)} />
          ))
        }
      </QueryView>
    </>
  );
}

/** 1 つのクライアント。名前は自由に名乗れるので、配布元のホストを並べて見分けられるようにする */
function ClientItem({ client, onRevoke }: { client: McpClient; onRevoke: () => void }) {
  return (
    <ListItem
      secondaryAction={
        <IconButton edge="end" aria-label={`${client.name} を失効`} onClick={onRevoke}>
          <DeleteIcon />
        </IconButton>
      }
    >
      <ListItemText
        primary={client.name}
        secondary={`${client.site}・${formatDateTime(client.authorizedAt)} に許可`}
      />
    </ListItem>
  );
}
