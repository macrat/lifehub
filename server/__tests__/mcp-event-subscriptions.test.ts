import { randomBytes } from 'node:crypto';
import type { ProtocolError } from '@modelcontextprotocol/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { clearTables, createTestUser } from '../lib/db/test-db.ts';
import { connect } from './mcp-client.ts';

const anyResult = z.looseObject({});
const secret = `whsec_${randomBytes(32).toString('base64')}`;
const webhook = (url: string, mode = 'webhook') => ({ mode, url, secret });

describe('MCP server: MCP Events', () => {
  let userId: string;
  beforeEach(async () => {
    await clearTables();
    userId = await createTestUser('A');
  });

  it('記録の種類ごとのイベントを、webhook で配れるものとして公開する', async () => {
    const client = await connect(userId);
    expect(client.getServerCapabilities()?.extensions).toHaveProperty(
      'io.modelcontextprotocol/events',
    );
    const { events } = (await client.request({ method: 'events/list', params: {} }, anyResult)) as {
      events: { name: string; delivery: string[]; payloadSchema: object }[];
    };
    expect(events.map((e) => e.name)).toEqual([
      'memo.changed',
      'event.changed',
      'expense.changed',
      'lemon.changed',
    ]);
    for (const event of events) {
      expect(event.delivery).toEqual(['webhook']);
      expect(event.payloadSchema).toMatchObject({
        properties: { action: { enum: ['added', 'updated', 'deleted'] } },
        required: ['action', 'by', 'entry'],
      });
    }
  });

  it('購読できない求めは、MCP Events のエラーコードで断る', async () => {
    const client = await connect(userId);
    const subscribe = (params: Record<string, unknown>) =>
      client.request({ method: 'events/subscribe', params }, anyResult).then(
        () => undefined,
        (error: unknown) => error as ProtocolError,
      );
    const url = 'https://receiver.example.com/hook';
    expect(await subscribe({ name: 'memo.removed', delivery: webhook(url) })).toMatchObject({
      code: -32011,
    });
    expect(await subscribe({ name: 'memo.changed', delivery: webhook(url, 'poll') })).toMatchObject(
      {
        code: -32014,
      },
    );
    expect(
      await subscribe({ name: 'memo.changed', delivery: webhook('http://receiver.example.com/') }),
    ).toMatchObject({ code: -32602 });
    expect(
      await subscribe({
        name: 'memo.changed',
        delivery: { ...webhook(url), secret: 'whsec_c2hvcnQ=' },
      }),
    ).toMatchObject({ code: -32602 });
    expect(
      await subscribe({ name: 'memo.changed', arguments: { q: '牛乳' }, delivery: webhook(url) }),
    ).toMatchObject({ code: -32602 });
  });

  it('内部のアドレスへは送らず、受け手を確かめられなかったとして断る', async () => {
    const client = await connect(userId);
    for (const url of [
      'https://127.0.0.1/hook',
      'https://169.254.169.254/latest',
      'https://localhost/',
    ]) {
      const error = await client
        .request(
          { method: 'events/subscribe', params: { name: 'memo.changed', delivery: webhook(url) } },
          anyResult,
        )
        .catch((e: unknown) => e);
      expect(error).toMatchObject({ code: -32015, data: { reason: 'connection_refused' } });
    }
  });

  it('購読していなくても、やめる求めは成功する', async () => {
    const client = await connect(userId);
    const result = await client.request(
      {
        method: 'events/unsubscribe',
        params: { name: 'memo.changed', delivery: { url: 'https://receiver.example.com/hook' } },
      },
      anyResult,
    );
    // 結果は空（SDK が付けるサーバーの名乗り _meta のほかに何も無い）
    const { _meta, ...rest } = result;
    expect(rest).toEqual({});
  });
});
