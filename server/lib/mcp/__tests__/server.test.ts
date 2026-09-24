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

  describe('events_update は部分更新', () => {
    async function create(client: Client, args: Record<string, unknown>): Promise<string> {
      const created = JSON.parse(
        text(await client.callTool({ name: 'events_create', arguments: args })),
      ) as { id: string };
      return created.id;
    }
    async function list(client: Client, from: string, to: string) {
      return JSON.parse(
        text(await client.callTool({ name: 'events_list', arguments: { from, to } })),
      ) as {
        title: string;
        startsAt: string;
        endsAt: string;
        location: string | null;
        rrule: string | null;
        occurrenceStart: string | null;
      }[];
    }

    it('省いた項目（繰り返し・場所）は今の値のまま残る', async () => {
      const client = await connect(userId);
      const id = await create(client, {
        kind: 'event',
        title: '歯医者',
        startsAt: '2030-01-07T09:00:00+09:00',
        endsAt: '2030-01-07T10:00:00+09:00',
        participantIds: [userId],
        location: '駅前',
        rrule: 'FREQ=WEEKLY',
      });
      const result = await client.callTool({
        name: 'events_update',
        arguments: { id, title: '矯正歯科' },
      });
      expect(result.isError).toBeFalsy();
      const items = await list(client, '2030-01-01', '2030-01-31');
      expect(items).toHaveLength(4);
      for (const item of items) {
        expect(item.title).toBe('矯正歯科');
        expect(item.location).toBe('駅前');
        expect(item.rrule).toBe('FREQ=WEEKLY');
      }
    });

    it('null を指定した項目は消える', async () => {
      const client = await connect(userId);
      const id = await create(client, {
        kind: 'event',
        title: '歯医者',
        startsAt: '2030-01-07T09:00:00+09:00',
        endsAt: '2030-01-07T10:00:00+09:00',
        participantIds: [userId],
        location: '駅前',
      });
      await client.callTool({ name: 'events_update', arguments: { id, location: null } });
      const [item] = await list(client, '2030-01-07', '2030-01-07');
      expect(item?.location).toBeNull();
    });

    it('回だけの変更で日時を省くと、その回の日時のまま（最初の回に戻らない）', async () => {
      const client = await connect(userId);
      const id = await create(client, {
        kind: 'event',
        title: '歯医者',
        startsAt: '2030-01-07T09:00:00+09:00',
        endsAt: '2030-01-07T10:00:00+09:00',
        participantIds: [userId],
        rrule: 'FREQ=WEEKLY',
      });
      const second = new Date('2030-01-14T09:00:00+09:00').toISOString();
      const result = await client.callTool({
        name: 'events_update',
        arguments: { id, scope: 'this', occurrenceStart: second, title: '別の歯医者' },
      });
      expect(result.isError).toBeFalsy();
      const items = await list(client, '2030-01-01', '2030-01-31');
      const changed = items.find((i) => i.occurrenceStart === second);
      expect(changed?.title).toBe('別の歯医者');
      expect(changed?.startsAt).toBe(second);
      expect(items.filter((i) => i.title === '歯医者')).toHaveLength(3);
    });

    it('終日の項目で日付を省いても、終わりの日は延びない', async () => {
      const client = await connect(userId);
      const id = await create(client, {
        kind: 'event',
        title: '旅行',
        allDay: true,
        startsAt: '2030-01-07T00:00:00+09:00',
        endsAt: '2030-01-08T00:00:00+09:00',
        participantIds: [userId],
      });
      const before = await list(client, '2030-01-01', '2030-01-31');
      await client.callTool({ name: 'events_update', arguments: { id, title: '家族旅行' } });
      const after = await list(client, '2030-01-01', '2030-01-31');
      expect(after.map((i) => [i.title, i.startsAt, i.endsAt])).toEqual(
        before.map((i) => ['家族旅行', i.startsAt, i.endsAt]),
      );
    });

    it('重ねた結果が規則に合わなければ、理由を文で返して保存しない', async () => {
      const client = await connect(userId);
      const id = await create(client, {
        kind: 'event',
        title: '歯医者',
        startsAt: '2030-01-07T09:00:00+09:00',
        endsAt: '2030-01-07T10:00:00+09:00',
        participantIds: [userId],
      });
      const result = await client.callTool({
        name: 'events_update',
        arguments: { id, endsAt: '2030-01-07T08:00:00+09:00' },
      });
      expect(result.isError).toBe(true);
      expect(text(result)).toContain('終了日時は開始日時以降');
      const [item] = await list(client, '2030-01-07', '2030-01-07');
      expect(item?.endsAt).toBe(new Date('2030-01-07T10:00:00+09:00').toISOString());
    });
  });
});
