import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestUser, truncateAll } from '../../test-db.ts';
import { createMcpServer } from '../server.ts';

async function connect(userId: string): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer({ userId });
  await server.connect(serverTransport);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

function text(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = result.content as { type: string; text?: string }[];
  return content[0]?.text ?? '';
}

describe('MCP server', () => {
  let userId: string;
  beforeEach(async () => {
    await truncateAll();
    userId = await createTestUser('A');
    await createTestUser('B');
  });

  it('全 feature のツールを公開する', async () => {
    const client = await connect(userId);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'users_list',
        'events_list',
        'events_create',
        'events_update',
        'events_delete',
        'events_complete',
        'events_uncomplete',
        'expenses_get_balance',
        'expenses_list',
        'expenses_add',
        'lemon_get_status',
        'lemon_log_care',
      ].sort(),
    );
    for (const tool of tools) expect(tool.description, tool.name).toBeTruthy();
  });

  it('ツールは UI と同じ service を呼ぶ（予定の作成 → 一覧、タスクの完了）', async () => {
    const client = await connect(userId);
    const users = JSON.parse(
      text(await client.callTool({ name: 'users_list', arguments: {} })),
    ) as { id: string; isMe: boolean }[];
    expect(users.find((u) => u.id === userId)?.isMe).toBe(true);

    await client.callTool({
      name: 'events_create',
      arguments: {
        kind: 'event',
        title: '歯医者',
        startsAt: '2030-01-07T09:00:00+09:00',
        endsAt: '2030-01-07T10:00:00+09:00',
        participantIds: [userId],
        rrule: 'FREQ=WEEKLY',
      },
    });
    const events = JSON.parse(
      text(
        await client.callTool({
          name: 'events_list',
          arguments: { from: '2030-01-01', to: '2030-01-31' },
        }),
      ),
    );
    expect(events).toHaveLength(4);

    const created = JSON.parse(
      text(
        await client.callTool({
          name: 'events_create',
          arguments: { kind: 'task', title: '提出', participantIds: [userId] },
        }),
      ),
    );
    await client.callTool({ name: 'events_complete', arguments: { id: created.id } });
    const items = JSON.parse(
      text(
        await client.callTool({
          name: 'events_list',
          arguments: { from: '2000-01-01', to: '2100-01-01' },
        }),
      ),
    ) as { kind: string; completedAt?: string | null }[];
    expect(items.filter((i) => i.kind === 'task').map((i) => i.completedAt !== null)).toEqual([
      true,
    ]);
  });

  it('入力の検証エラーはツールのエラーとして返る', async () => {
    const client = await connect(userId);
    const result = await client.callTool({
      name: 'expenses_add',
      arguments: { fromUserId: 'x', toUserId: null, amount: -1, description: '', spentOn: 'bad' },
    });
    expect(result.isError).toBe(true);
  });

  it('繰り返しの回の指定は平らな項目で受け、scope を省略すればすべての回、回の抜けは足すべき物を文で返す', async () => {
    const client = await connect(userId);
    const { tools } = await client.listTools();
    const update = tools.find((t) => t.name === 'events_update');
    // 入力の最上位はオブジェクト（anyOf にしない）で、scope と occurrenceStart が項目として見える
    expect(update?.inputSchema.type).toBe('object');
    expect(Object.keys(update?.inputSchema.properties ?? {})).toEqual(
      expect.arrayContaining(['id', 'scope', 'occurrenceStart']),
    );

    const created = JSON.parse(
      text(
        await client.callTool({
          name: 'events_create',
          arguments: { kind: 'task', title: '提出', participantIds: [userId] },
        }),
      ),
    ) as { id: string };
    const missing = await client.callTool({
      name: 'events_delete',
      arguments: { id: created.id, scope: 'this' },
    });
    expect(missing.isError).toBe(true);
    expect(text(missing)).toContain('occurrenceStart');

    const deleted = await client.callTool({ name: 'events_delete', arguments: { id: created.id } });
    expect(deleted.isError).toBeFalsy();
  });
});
