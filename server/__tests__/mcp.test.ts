import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, today } from '../../shared/date.ts';
import { newId } from '../../shared/id.ts';
import { db } from '../lib/db/client.ts';
import { oauthClients } from '../lib/db/oauth-schema.ts';
import { clearTables, createTestUser } from '../lib/db/test-db.ts';
import { call, connect, type Day, type Entry, fail, readDays, run } from './mcp-client.ts';

describe('MCP server', () => {
  let userId: string;
  let otherId: string;
  beforeEach(async () => {
    await clearTables();
    userId = await createTestUser('A');
    otherId = await createTestUser('B');
  });

  it('タイムラインを中心にしたツールを、説明と性質（読むだけか）付きで公開する', async () => {
    const client = await connect(userId);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'get_overview',
        'read_timeline',
        'delete_entry',
        'add_event',
        'update_event',
        'set_task_done',
        'add_expense',
        'update_expense',
        'log_lemon_care',
        'update_lemon_log',
        'add_memo',
        'update_memo',
        'get_weather',
      ].sort(),
    );
    for (const tool of tools) {
      expect(tool.description, tool.name).toBeTruthy();
      // 入力の最上位はオブジェクト（anyOf にしない）
      expect(tool.inputSchema.type, tool.name).toBe('object');
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(
        ['get_overview', 'read_timeline', 'get_weather'].includes(tool.name),
      );
    }
    expect(tools.find((t) => t.name === 'delete_entry')?.annotations?.destructiveHint).toBe(true);
    expect(client.getInstructions()).toContain('get_overview');
    // 説明が名前で指すツール（snake_case。add_* は接頭辞）は、どれも公開している（改名したツールを指し残さない）
    const texts = tools.map((t) => `${t.description} ${JSON.stringify(t.inputSchema)}`);
    for (const [ref] of [client.getInstructions(), ...texts]
      .join(' ')
      .matchAll(/\b[a-z]+(?:_[a-z*]+)+/g)) {
      const matches = (name: string) =>
        ref.endsWith('*') ? name.startsWith(ref.slice(0, -1)) : name === ref;
      expect(
        tools.some((t) => matches(t.name)),
        ref,
      ).toBe(true);
    }
  });

  it('get_overview は今日・ユーザーの名前と自分・今日と明日の日・レモンの状況を返す', async () => {
    const client = await connect(userId);
    const overview = await call<{
      today: string;
      now: string;
      users: { name: string; isMe: boolean }[];
      days: Day[];
      expenseBalance: { settled: boolean };
      lemon: { careType: string }[];
    }>(client, 'get_overview');
    expect(overview.today).toBe(today());
    expect(overview.now).toMatch(/\+09:00$/);
    expect(overview.users.map((u) => [u.name, u.isMe])).toEqual([
      ['A', true],
      ['B', false],
    ]);
    expect(overview.days.map((d) => d.date)).toEqual([today(), addDays(today(), 1)]);
    expect(overview.expenseBalance.settled).toBe(true);
    expect(overview.lemon.map((s) => s.careType)).toContain('water');
  });

  describe('立替', () => {
    it('名前と "shared" で記録し、日付を省くと今日、記録した後の残高を返す', async () => {
      const client = await connect(userId);
      const result = await call<{ entry: Entry; balance: Record<string, unknown> }>(
        client,
        'add_expense',
        { amount: 1000, description: 'スーパー', paidFor: 'shared' },
      );
      expect(result.entry).toMatchObject({
        date: today(),
        paidBy: 'A',
        paidFor: 'shared',
        amount: 1000,
      });
      expect(result.balance).toEqual({ settled: false, amount: 500, payer: 'B', payee: 'A' });

      const updated = await call<{ entry: Entry; balance: Record<string, unknown> }>(
        client,
        'update_expense',
        { ref: result.entry.ref, amount: 2000 },
      );
      expect(updated.entry).toMatchObject({ amount: 2000, description: 'スーパー' });
      expect(updated.balance).toMatchObject({ amount: 1000, payer: 'B' });
      expect(await fail(client, 'update_expense', { ref: result.entry.ref, paidFor: 'me' })).toBe(
        'From と To に同じ人は選べません',
      );

      // 精算は、払った人から受け取った人への立替として記録する
      const settled = await call<{ balance: Record<string, unknown> }>(client, 'add_expense', {
        amount: 1000,
        description: '精算',
        paidBy: 'B',
        paidFor: 'A',
      });
      expect(settled.balance).toEqual({ settled: true, amount: 0 });
    });

    it('知らない人の名前は、選べる名前を文で返す', async () => {
      const client = await connect(userId);
      const message = await fail(client, 'add_expense', {
        amount: 100,
        description: 'パン',
        paidFor: 'C',
      });
      expect(message).toContain('"A"');
      expect(message).toContain('"B"');
    });

    it('種類の違う ref を渡すと、何の ref かを文で返す', async () => {
      const client = await connect(userId);
      const memo = await call<Entry>(client, 'add_memo', { body: 'ねじ' });
      expect(await fail(client, 'update_expense', { ref: memo.ref, amount: 1 })).toContain('メモ');
    });
  });

  describe('レモン・メモ', () => {
    it('世話の日時を省くと今で、直すと省いた項目は今のまま', async () => {
      const client = await connect(userId);
      const log = await call<Entry>(client, 'log_lemon_care', { careTypes: ['water', 'mist'] });
      expect(log).toMatchObject({ careTypes: ['mist', 'water'], by: 'A' });
      expect(log.at).toMatch(new RegExp(`^${today()}T`));

      const updated = await call<Entry>(client, 'update_lemon_log', { ref: log.ref, note: '新芽' });
      expect(updated).toMatchObject({ careTypes: ['mist', 'water'], note: '新芽', at: log.at });
      expect(await fail(client, 'log_lemon_care', { careTypes: [] })).toContain('メモ');
    });

    it('メモは書いた本人だけが直せ、タイムラインで q で探せる', async () => {
      const client = await connect(userId);
      const memo = await call<Entry>(client, 'add_memo', { body: '洗剤が切れそう' });
      expect(memo).toMatchObject({ type: 'memo', body: '洗剤が切れそう', by: 'A', via: 'MCP' });

      const other = await connect(otherId);
      expect(await fail(other, 'update_memo', { ref: memo.ref, body: '別' })).toContain('ほかの人');
      await call(client, 'update_memo', { ref: memo.ref, body: '洗剤を買う' });
      const days = await readDays(client, { q: '洗剤', from: addDays(today(), -30), to: today() });
      expect(days.flatMap((d) => d.entries.map((e) => e.body))).toEqual(['洗剤を買う']);

      await run(client, 'delete_entry', { ref: memo.ref });
      expect(await readDays(client, { q: '洗剤', from: today(), to: today() })).toEqual([]);
    });

    it('メモには書いた MCP クライアントの登録の名前を残す', async () => {
      await db.insert(oauthClients).values({
        id: newId(),
        clientId: 'claude',
        name: 'Claude',
        redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
      });
      const memo = await call<Entry>(await connect(userId, 'claude'), 'add_memo', { body: 'ねじ' });
      expect(memo).toMatchObject({ by: 'A', via: 'Claude' });
    });
  });

  it('get_weather は期間の天気を日ごとに返し、期間が長すぎれば文で返す', async () => {
    const client = await connect(userId);
    const weather = await call<{ days: unknown[] }>(client, 'get_weather');
    expect(weather.days).toEqual([]);
    expect(await fail(client, 'get_weather', { from: '2030-01-01', to: '2030-03-01' })).toContain(
      '31',
    );
  });
});
