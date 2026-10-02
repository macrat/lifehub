import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { expect } from 'vitest';
import { createMcpServer } from '../mcp.ts';

/** MCP のテストで、サーバーにつないでツールを呼ぶための共通の手順 */

export async function connect(userId: string): Promise<Client> {
  // 本番と同じく HTTP の口（createMcpHandler）を通す。トークンの検証（requireMcpAuth）だけを飛ばす
  const handler = createMcpHandler(() => createMcpServer({ userId }));
  const transport = new StreamableHTTPClientTransport(new URL('http://localhost/api/mcp'), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  // 2026-07-28 の MCP でつなぐ（つながらなければ失敗させ、黙って 2025 年版に落ちないように）
  const client = new Client(
    { name: 'test', version: '0.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  await client.connect(transport);
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
