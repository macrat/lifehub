import pg from 'pg';
import { vi } from 'vitest';

/** 行った SQL 文（node-postgres の接続が送ったもの。トランザクションの中の文も含む） */
export function recordStatements(): string[] {
  const statements: string[] = [];
  const query = pg.Client.prototype.query;
  vi.spyOn(pg.Client.prototype, 'query').mockImplementation(function (
    this: pg.Client,
    ...args: unknown[]
  ) {
    const config = args[0];
    statements.push(typeof config === 'string' ? config : (config as { text: string }).text);
    return (query as (...a: unknown[]) => unknown).apply(this, args) as never;
  });
  return statements;
}
