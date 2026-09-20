import { beforeEach, describe, expect, it } from 'vitest';
import { createTaskSchema, updateTaskSchema } from '../../../../shared/validation/tasks.ts';
import { ValidationError } from '../../../lib/errors.ts';
import { truncateAll } from '../../../lib/test-db.ts';
import { createUser } from '../../users/service.ts';
import {
  completeTask,
  createTask,
  deleteTask,
  listOccurrences,
  uncompleteTask,
  updateTask,
} from '../service.ts';

const jst = (s: string) => new Date(`${s}+09:00`);
const iso = (s: string) => jst(s).toISOString();

// 「今日」を 2026-09-14（月）の正午に固定する
const now = jst('2026-09-14T12:00:00');
const september = { from: '2026-09-01', to: '2026-09-30' } as const;

let userId: string;

describe('tasks service', () => {
  beforeEach(async () => {
    await truncateAll();
    userId = (await createUser({ email: 'a@example.com', name: 'A', password: 'password-123456' }))
      .id;
  });

  it('開始日時が未来のタスクは開始日、過去・未設定は今日に置く', async () => {
    await createTask(
      createTaskSchema.parse({ title: '未来', startsAt: iso('2026-09-20T10:00:00') }),
      userId,
    );
    await createTask(
      createTaskSchema.parse({ title: '過去', startsAt: iso('2026-09-01T10:00:00') }),
      userId,
    );
    await createTask(
      createTaskSchema.parse({ title: '未設定', dueAt: iso('2026-09-25T10:00:00') }),
      userId,
    );
    const list = await listOccurrences(september, now);
    expect(list.map((t) => [t.title, t.placementDate, t.occurrenceKey])).toEqual([
      ['未設定', '2026-09-14', 'single'],
      ['過去', '2026-09-14', 'single'],
      ['未来', '2026-09-20', 'single'],
    ]);
  });

  it('完了すると完了日の位置に移り、取り消すと戻る', async () => {
    const task = await createTask(createTaskSchema.parse({ title: '買い物' }), userId);
    await completeTask(task.id, 'single', userId, jst('2026-09-10T18:00:00'));
    let list = await listOccurrences(september, now);
    expect(list.map((t) => [t.placementDate, t.completedAt])).toEqual([
      ['2026-09-10', iso('2026-09-10T18:00:00')],
    ]);
    await uncompleteTask(task.id, 'single');
    list = await listOccurrences(september, now);
    expect(list.map((t) => [t.placementDate, t.completedAt])).toEqual([['2026-09-14', null]]);
  });

  it('期限超過を判定する', async () => {
    await createTask(
      createTaskSchema.parse({ title: '超過', dueAt: iso('2026-09-13T10:00:00') }),
      userId,
    );
    await createTask(
      createTaskSchema.parse({ title: '余裕', dueAt: iso('2026-09-15T10:00:00') }),
      userId,
    );
    const list = await listOccurrences(september, now);
    expect(list.map((t) => [t.title, t.isOverdue])).toEqual([
      ['超過', true],
      ['余裕', false],
    ]);
  });

  it('繰り返しタスクは未完了を最大 2 つまで表示し、過去の回は今日に置く', async () => {
    // 毎週月曜 9:00。今日は 9/14（月）正午
    await createTask(
      createTaskSchema.parse({
        title: 'ゴミ出し',
        startsAt: iso('2026-09-07T09:00:00'),
        rrule: 'FREQ=WEEKLY',
      }),
      userId,
    );
    const list = await listOccurrences(september, now);
    expect(list.map((t) => [t.occurrenceKey, t.placementDate])).toEqual([
      [iso('2026-09-07T09:00:00'), '2026-09-14'],
      [iso('2026-09-14T09:00:00'), '2026-09-14'],
    ]);
  });

  it('未完了の回は 2 つ後の回が来た時点で放棄される', async () => {
    await createTask(
      createTaskSchema.parse({
        title: 'ゴミ出し',
        startsAt: iso('2026-09-07T09:00:00'),
        rrule: 'FREQ=WEEKLY',
      }),
      userId,
    );
    const list = await listOccurrences(september, jst('2026-09-21T12:00:00'));
    expect(list.map((t) => [t.occurrenceKey, t.placementDate])).toEqual([
      [iso('2026-09-14T09:00:00'), '2026-09-21'],
      [iso('2026-09-21T09:00:00'), '2026-09-21'],
    ]);
  });

  it('完了した回は完了日に置き、次の未完了が繰り上がる', async () => {
    const task = await createTask(
      createTaskSchema.parse({
        title: 'ゴミ出し',
        startsAt: iso('2026-09-07T09:00:00'),
        rrule: 'FREQ=WEEKLY',
      }),
      userId,
    );
    await completeTask(task.id, iso('2026-09-07T09:00:00'), userId, jst('2026-09-07T10:00:00'));
    const list = await listOccurrences(september, now);
    expect(list.map((t) => [t.occurrenceKey, t.placementDate, t.completedAt !== null])).toEqual([
      [iso('2026-09-07T09:00:00'), '2026-09-07', true],
      [iso('2026-09-14T09:00:00'), '2026-09-14', false],
      [iso('2026-09-21T09:00:00'), '2026-09-21', false],
    ]);
  });

  it('開始と期限の両方を持つ繰り返しは同じ間隔でずれる', async () => {
    await createTask(
      createTaskSchema.parse({
        title: '家賃',
        startsAt: iso('2026-09-20T00:00:00'),
        dueAt: iso('2026-09-27T00:00:00'),
        rrule: 'FREQ=MONTHLY',
      }),
      userId,
    );
    const list = await listOccurrences({ from: '2026-09-01', to: '2026-12-31' }, now);
    expect(list.map((t) => [t.startsAt, t.dueAt])).toEqual([
      [iso('2026-09-20T00:00:00'), iso('2026-09-27T00:00:00')],
      [iso('2026-10-20T00:00:00'), iso('2026-10-27T00:00:00')],
    ]);
  });

  it('存在しない回は完了にできない', async () => {
    const task = await createTask(
      createTaskSchema.parse({
        title: 'ゴミ出し',
        startsAt: iso('2026-09-07T09:00:00'),
        rrule: 'FREQ=WEEKLY',
      }),
      userId,
    );
    await expect(completeTask(task.id, iso('2026-09-08T09:00:00'), userId)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(completeTask(task.id, 'single', userId)).rejects.toBeInstanceOf(ValidationError);
  });

  it('「この回だけ」の取り消しと「これ以降すべて」の分割', async () => {
    const task = await createTask(
      createTaskSchema.parse({
        title: 'ゴミ出し',
        startsAt: iso('2026-09-07T09:00:00'),
        rrule: 'FREQ=WEEKLY',
      }),
      userId,
    );
    await deleteTask(task.id, { scope: 'this', occurrenceKey: iso('2026-09-07T09:00:00') }, userId);
    const next = await updateTask(
      task.id,
      updateTaskSchema.parse({
        title: '資源ゴミ',
        startsAt: iso('2026-09-21T09:00:00'),
        rrule: 'FREQ=WEEKLY',
        scope: 'following',
        occurrenceKey: iso('2026-09-21T09:00:00'),
      }),
      userId,
    );
    // 元の系列は 9/14 で終わる。最後の回は次の回が無いので放棄されず、完了するまで今日に残る
    const list = await listOccurrences(september, jst('2026-09-28T12:00:00'));
    expect(
      list.map((t) => [
        t.id === next.id ? 'new' : 'old',
        t.title,
        t.occurrenceKey,
        t.placementDate,
      ]),
    ).toEqual([
      ['old', 'ゴミ出し', iso('2026-09-14T09:00:00'), '2026-09-28'],
      ['new', '資源ゴミ', iso('2026-09-21T09:00:00'), '2026-09-28'],
      ['new', '資源ゴミ', iso('2026-09-28T09:00:00'), '2026-09-28'],
    ]);
  });
});
