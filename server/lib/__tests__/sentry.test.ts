import { describe, expect, it } from 'vitest';
import { statementsOf } from '../sentry.ts';

describe('Neon への要求から SQL 文を取り出す', () => {
  it('問い合わせ 1 つなら、その文だけを返す（値は含めない）', () => {
    const body = JSON.stringify({
      query: 'select "id" from "events" where "id" = $1',
      params: ['秘密'],
    });
    expect(statementsOf(body)).toEqual(['select "id" from "events" where "id" = $1']);
  });

  it('トランザクションなら、文を並びのまま返す', () => {
    const body = JSON.stringify({
      queries: [
        { query: 'insert into "expenses" ("amount") values ($1)', params: [1200] },
        { query: 'delete from "memos" where "id" = $1', params: ['m1'] },
      ],
    });
    expect(statementsOf(body)).toEqual([
      'insert into "expenses" ("amount") values ($1)',
      'delete from "memos" where "id" = $1',
    ]);
  });

  it('読めない本文なら空を返す（計らずに送るだけにする）', () => {
    expect(statementsOf(undefined)).toEqual([]);
    expect(statementsOf('not json')).toEqual([]);
    expect(statementsOf(JSON.stringify({ unexpected: true }))).toEqual([]);
  });
});
