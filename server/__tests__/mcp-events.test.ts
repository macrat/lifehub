import { beforeEach, describe, expect, it } from 'vitest';
import { today } from '../../shared/date.ts';
import { clearTables, createTestUser } from '../lib/db/test-db.ts';
import { call, connect, type Entry, fail, readDays, run } from './mcp-client.ts';

const WEEKLY_DENTIST = {
  title: '歯医者',
  start: '2030-01-07T09:00',
  end: '2030-01-07T10:00',
  location: '駅前',
  repeat: 'FREQ=WEEKLY',
};

describe('MCP server: 予定・タスク', () => {
  let userId: string;
  beforeEach(async () => {
    await clearTables();
    userId = await createTestUser('A');
    // 参加者に名前で指す相手
    await createTestUser('B');
  });

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

  it('1 日の中はホームのタイムラインと同じ置き方の古い順（終日の予定はその日の終わり）', async () => {
    const client = await connect(userId);
    await call(client, 'add_event', {
      title: '終日の予定',
      start: '2030-01-08',
      end: '2030-01-08',
    });
    await call(client, 'add_event', {
      title: '10 時の予定',
      start: '2030-01-08T10:00',
      end: '2030-01-08T11:00',
    });
    await call(client, 'add_task', { title: '終日のタスク', start: '2030-01-08' });
    const [day] = await readDays(client, { from: '2030-01-08', to: '2030-01-08' });
    expect(day?.entries.map((e) => e.title)).toEqual(['終日のタスク', '10 時の予定', '終日の予定']);
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

    const changed = await call<Entry>(client, 'update_event', {
      ref: second?.ref,
      scope: 'this',
      title: '矯正',
    });
    // 返すのは変えた回（同じ回の ref、その回の日時）
    expect(changed).toMatchObject({
      ref: second?.ref,
      title: '矯正',
      start: '2030-01-14T09:00+09:00',
      repeat: 'FREQ=WEEKLY',
    });
    const titles = (await readDays(client, { from: '2030-01-01', to: '2030-01-31' })).flatMap((d) =>
      d.entries.map((e) => e.title),
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

  it('終日と時刻ありを切り替えるときは両端を求め、省いた端を黙って丸めない', async () => {
    const client = await connect(userId);
    const task = await call<Entry>(client, 'add_task', {
      title: '提出',
      start: '2030-01-07T09:00',
      due: '2030-01-08T18:00',
    });
    const message = await fail(client, 'update_event', { ref: task.ref, due: '2030-01-09' });
    expect(message).toContain('両方');

    const updated = await call<Entry>(client, 'update_event', {
      ref: task.ref,
      start: null,
      due: '2030-01-09',
    });
    expect(updated).toMatchObject({ due: '2030-01-09' });
    expect(updated).not.toHaveProperty('start');
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
    const third = (await readDays(client, { from: '2030-01-21', to: '2030-01-21' }))[0]?.entries[0];
    await run(client, 'delete_entry', { ref: third?.ref, scope: 'following' });
    const days = await readDays(client, { from: '2030-01-01', to: '2030-01-31', q: '歯医者' });
    expect(days.map((d) => d.date)).toEqual(['2030-01-07', '2030-01-14']);
  });
});
