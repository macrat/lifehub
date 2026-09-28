import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, today } from '../../shared/date.ts';
import { clearTables, createTestUser } from '../lib/db/test-db.ts';
import { createMcpServer } from '../mcp.ts';

async function connect(userId: string): Promise<Client> {
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

type Entry = Record<string, unknown> & { ref: string; type: string; title?: string };
type Day = { date: string; weekday: string; entries: Entry[] };

/** ツールを呼び、成功を確かめて結果の文を返す */
async function run(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError, text(result)).toBeFalsy();
  return text(result);
}

/** ツールを呼び、成功を確かめて JSON を読む */
async function call<T>(client: Client, name: string, args: Record<string, unknown> = {}) {
  return JSON.parse(await run(client, name, args)) as T;
}

/** ツールを呼び、失敗することを確かめて文を返す */
async function fail(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError).toBe(true);
  return text(result);
}

async function readDays(client: Client, args: Record<string, unknown>): Promise<Day[]> {
  return (await call<{ days: Day[] }>(client, 'read_timeline', args)).days;
}

const WEEKLY_DENTIST = {
  title: '歯医者',
  start: '2030-01-07T09:00',
  end: '2030-01-07T10:00',
  location: '駅前',
  repeat: 'FREQ=WEEKLY',
};

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
        'add_task',
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

  describe('予定・タスク', () => {
    it('タイムゾーンを省いた日時は JST で、人は名前で受け、JST と名前で返す', async () => {
      const client = await connect(userId);
      const created = await call<Entry>(client, 'add_event', {
        ...WEEKLY_DENTIST,
        participants: ['me', 'B'],
      });
      expect(created).toMatchObject({
        type: 'event',
        start: '2030-01-07T09:00+09:00',
        end: '2030-01-07T10:00+09:00',
        participants: ['A', 'B'],
        repeat: 'FREQ=WEEKLY',
      });
      const days = await readDays(client, { from: '2030-01-01', to: '2030-01-31' });
      const dentists = days.flatMap((d) => d.entries);
      expect(dentists).toHaveLength(4);
      // 繰り返しの回は、回を指す ref（@ 付き）を持つ
      for (const entry of dentists) expect(entry.ref).toContain('@');
      expect(days.find((d) => d.date === '2030-01-07')?.weekday).toBe('月');
    });

    it('複数日の終日の予定は掛かる日すべてに出る（日付を指して読んでも見つかる）', async () => {
      const client = await connect(userId);
      await call(client, 'add_event', { title: '旅行', start: '2030-01-07', end: '2030-01-08' });
      const [day] = await readDays(client, { from: '2030-01-08', to: '2030-01-08' });
      expect(day?.entries).toEqual([
        expect.objectContaining({
          title: '旅行',
          start: '2030-01-07',
          end: '2030-01-08',
          allDay: true,
          day: '2/2',
        }),
      ]);
    });

    it('開始と終了の形（日付と日時）が混ざっていれば、揃えるよう文で返す', async () => {
      const client = await connect(userId);
      const message = await fail(client, 'add_event', {
        title: '旅行',
        start: '2030-01-07',
        end: '2030-01-08T10:00',
      });
      expect(message).toContain('どちらも日付');
    });

    it('繰り返しの回を変えるには scope を選ばせ、this はその回だけを変える', async () => {
      const client = await connect(userId);
      await call(client, 'add_event', WEEKLY_DENTIST);
      const second = (await readDays(client, { from: '2030-01-14', to: '2030-01-14' }))[0]
        ?.entries[0];
      expect(await fail(client, 'update_event', { ref: second?.ref, title: '矯正' })).toContain(
        'scope',
      );

      await call(client, 'update_event', { ref: second?.ref, scope: 'this', title: '矯正' });
      const titles = (await readDays(client, { from: '2030-01-01', to: '2030-01-31' })).flatMap(
        (d) => d.entries.map((e) => e.title),
      );
      expect(titles).toEqual(['歯医者', '矯正', '歯医者', '歯医者']);
    });

    it('部分更新: 省いた項目は今のまま、null は消し、開始だけを変えると長さを保って動かす', async () => {
      const client = await connect(userId);
      const { ref } = await call<Entry>(client, 'add_event', WEEKLY_DENTIST);
      const updated = await call<Entry>(client, 'update_event', {
        ref,
        start: '2030-01-07T15:00',
        location: null,
      });
      expect(updated).toMatchObject({
        title: '歯医者',
        start: '2030-01-07T15:00+09:00',
        end: '2030-01-07T16:00+09:00',
        repeat: 'FREQ=WEEKLY',
      });
      expect(updated).not.toHaveProperty('location');
    });

    it('予定に due・タスクに end を渡すと、使う名前を文で返す', async () => {
      const client = await connect(userId);
      const event = await call<Entry>(client, 'add_event', WEEKLY_DENTIST);
      expect(await fail(client, 'update_event', { ref: event.ref, due: '2030-01-08' })).toContain(
        'end',
      );
      const task = await call<Entry>(client, 'add_task', { title: '提出' });
      expect(await fail(client, 'update_event', { ref: task.ref, end: '2030-01-08' })).toContain(
        'due',
      );
    });

    it('日時の無いタスクは今日に出て、set_task_done で完了・取り消しができる', async () => {
      const client = await connect(userId);
      const task = await call<Entry>(client, 'add_task', { title: '提出', due: '2030-01-31' });
      expect(task).toMatchObject({ type: 'task', done: false, due: '2030-01-31' });
      const undated = await call<Entry>(client, 'add_task', { title: '電球を替える' });
      expect(await fail(client, 'set_task_done', { ref: 'x' })).toContain('ref');

      const doneOf = async () => {
        const [day] = await readDays(client, { types: ['task'], from: today(), to: today() });
        return day?.entries.map((e) => [e.title, e.done]);
      };
      // 期限だけのタスクも、日時の無いタスクも、完了までは今日に出る
      expect(await doneOf()).toEqual(
        expect.arrayContaining([
          ['電球を替える', false],
          ['提出', false],
        ]),
      );
      await run(client, 'set_task_done', { ref: undated.ref });
      expect(await doneOf()).toContainEqual(['電球を替える', true]);
      await run(client, 'set_task_done', { ref: undated.ref, done: false });
      expect(await doneOf()).toContainEqual(['電球を替える', false]);
    });

    it('予定は完了にできないと文で返す', async () => {
      const client = await connect(userId);
      const event = await call<Entry>(client, 'add_event', WEEKLY_DENTIST);
      expect(await fail(client, 'set_task_done', { ref: event.ref })).toContain('予定');
    });

    it('delete_entry は繰り返しの回から following で以降を消す', async () => {
      const client = await connect(userId);
      await call(client, 'add_event', WEEKLY_DENTIST);
      const third = (await readDays(client, { from: '2030-01-21', to: '2030-01-21' }))[0]
        ?.entries[0];
      await run(client, 'delete_entry', { ref: third?.ref, scope: 'following' });
      const days = await readDays(client, { from: '2030-01-01', to: '2030-01-31', q: '歯医者' });
      expect(days.map((d) => d.date)).toEqual(['2030-01-07', '2030-01-14']);
    });
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
      expect(memo).toMatchObject({ type: 'memo', body: '洗剤が切れそう', by: 'A' });

      const other = await connect(otherId);
      expect(await fail(other, 'update_memo', { ref: memo.ref, body: '別' })).toContain('ほかの人');
      await call(client, 'update_memo', { ref: memo.ref, body: '洗剤を買う' });
      const days = await readDays(client, { q: '洗剤', from: addDays(today(), -30), to: today() });
      expect(days.flatMap((d) => d.entries.map((e) => e.body))).toEqual(['洗剤を買う']);

      await run(client, 'delete_entry', { ref: memo.ref });
      expect(await readDays(client, { q: '洗剤', from: today(), to: today() })).toEqual([]);
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
