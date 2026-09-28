import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { expect } from 'vitest';
import { createMcpServer } from '../mcp.ts';

/** MCP サーバーのテスト（`mcp*.test.ts`）で共有する、ツールを呼んで結果を読む道具 */

export async function connect(userId: string): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer({ userId });
  await server.connect(serverTransport);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

type Result = Awaited<ReturnType<Client['callTool']>>;

function text(result: Result): string {
  const content = result.content as { type: string; text?: string }[];
  return content[0]?.text ?? '';
}

export type Entry = Record<string, unknown> & { ref: string; type: string; title?: string };
export type Day = { date: string; weekday: string; entries: Entry[] };

/** ツールを呼び、成功を確かめて結果の文を返す */
export async function run(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError, text(result)).toBeFalsy();
  return text(result);
}

/** ツールを呼び、成功を確かめて JSON を読む */
export async function call<T>(client: Client, name: string, args: Record<string, unknown> = {}) {
  return JSON.parse(await run(client, name, args)) as T;
}

/** ツールを呼び、失敗することを確かめて文を返す */
export async function fail(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError).toBe(true);
  return text(result);
}

export async function readDays(client: Client, args: Record<string, unknown>): Promise<Day[]> {
  return (await call<{ days: Day[] }>(client, 'read_timeline', args)).days;
}
