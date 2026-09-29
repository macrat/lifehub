import type { NeonQueryFunction } from '@neondatabase/serverless';
import { describe, expect, it } from 'vitest';
import { coalesceReads, isReadOnlyStatement } from '../coalesce-reads.ts';

/** Neon の問い合わせの値と同じく、then / catch / finally が自分の execute を呼ぶ遅延の値 */
class FakeQuery {
  constructor(
    public execute: (queryData: { query: string }, opts?: unknown) => Promise<unknown>,
    public queryData: { query: string },
    public opts?: unknown,
  ) {}
  // biome-ignore lint/suspicious/noThenProperty: Neon の NeonQueryPromise と同じ形を真似る
  then<T>(resolve: (value: unknown) => T, reject?: (reason: unknown) => T) {
    return this.execute(this.queryData, this.opts).then(resolve, reject);
  }
}

/** 送った要求（1 文ずつか、まとめたものか）を記録する偽の Neon。`fail` に当たる文は失敗させる */
function fakeNeon(fail: string[] = []) {
  const sent: string[][] = [];
  const run = (query: string) =>
    fail.includes(query) ? Promise.reject(new Error(query)) : Promise.resolve(`rows of ${query}`);
  const executeOne = (queryData: { query: string }) => {
    sent.push([queryData.query]);
    return run(queryData.query);
  };
  const sql = {
    query: (query: string) => new FakeQuery(executeOne, { query }),
    transaction: async (queries: FakeQuery[]) => {
      sent.push(queries.map((q) => q.queryData.query));
      return Promise.all(queries.map((q) => run(q.queryData.query)));
    },
  };
  return { sql: coalesceReads(sql as unknown as NeonQueryFunction<false, false>), sent };
}

describe('読み取りをまとめる', () => {
  it('同じ時点に投げた読み取りは 1 回の要求で送り、それぞれに自分の結果を返す', async () => {
    const { sql, sent } = fakeNeon();
    const results = await Promise.all([
      sql.query('select 1'),
      sql.query('with a as (select 2) select * from a'),
    ]);
    expect(results).toEqual(['rows of select 1', 'rows of with a as (select 2) select * from a']);
    expect(sent).toEqual([['select 1', 'with a as (select 2) select * from a']]);
  });

  it('1 つだけなら、まとめずにそのまま送る', async () => {
    const { sql, sent } = fakeNeon();
    await sql.query('select 1');
    expect(sent).toEqual([['select 1']]);
  });

  it('書き込みはまとめず、1 文ずつ送る', async () => {
    const { sql, sent } = fakeNeon();
    await Promise.all([sql.query('select 1'), sql.query('update "memos" set "body" = $1')]);
    expect(sent).toEqual([['update "memos" set "body" = $1'], ['select 1']]);
  });

  it('まとめた中の 1 文が失敗したら、1 文ずつ送り直して失敗をその文にだけ返す', async () => {
    const { sql, sent } = fakeNeon(['select 2']);
    const results = await Promise.allSettled([sql.query('select 1'), sql.query('select 2')]);
    expect(results).toEqual([
      { status: 'fulfilled', value: 'rows of select 1' },
      { status: 'rejected', reason: new Error('select 2') },
    ]);
    expect(sent).toEqual([['select 1', 'select 2'], ['select 1'], ['select 2']]);
  });

  it('時点の違う読み取りは別の要求にする', async () => {
    const { sql, sent } = fakeNeon();
    await sql.query('select 1');
    await sql.query('select 2');
    expect(sent).toEqual([['select 1'], ['select 2']]);
  });
});

describe('まとめてよい文', () => {
  it.each([
    'select "id" from "events"',
    '  WITH "boundary" as (select 1) select * from "expenses"',
    'select "updated_at", "shared_with" from "memos"',
  ])('読み取り: %s', (text) => {
    expect(isReadOnlyStatement(text)).toBe(true);
  });

  it.each([
    'insert into "memos" values ($1)',
    'with moved as (update "events" set "title" = $1 returning *) select * from moved',
    'select * from "sessions" for update',
    'select * from "sessions" for share',
    'delete from "memos"',
  ])('読み取りでない: %s', (text) => {
    expect(isReadOnlyStatement(text)).toBe(false);
  });
});
