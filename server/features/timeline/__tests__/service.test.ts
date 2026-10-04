import { beforeEach, describe, expect, it } from 'vitest';
import { iso, jst } from '../../../../shared/__tests__/jst.ts';
import { toDateString } from '../../../../shared/date.ts';
import type { TimelineEntry } from '../../../../shared/timeline.ts';
import { dateStringSchema } from '../../../../shared/validation/common.ts';
import { createEventSchema, updateEventSchema } from '../../../../shared/validation/events.ts';
import { expenseSchema } from '../../../../shared/validation/expenses.ts';
import { resetUsers } from '../../../lib/db/test-db.ts';
import { completeEvent, createEvent, updateEvent } from '../../events/service.ts';
import { addExpense } from '../../expenses/service.ts';
import { logCare } from '../../lemon/service.ts';
import { addMemo, setMemoPinned } from '../../memos/service.ts';
import { getTimelinePage } from '../service.ts';

// 「今」を 2026-09-14（月）の正午に固定する
const now = jst('2026-09-14T12:00:00');

let userId: string;
let partnerId: string;

const event = (input: Record<string, unknown>) =>
  createEventSchema.parse({ kind: 'event', participantIds: [userId], ...input });
const task = (input: Record<string, unknown>) =>
  createEventSchema.parse({ kind: 'task', participantIds: [userId], ...input });
const day = (s: string) => dateStringSchema.parse(s);
const dayOf = (at: string) => toDateString(new Date(at));

/** 行を新しい順（画面の並び）に、見分けの付く名前で */
function labels(entries: TimelineEntry[]): string[] {
  return entries.toReversed().map(label);
}

function label(entry: TimelineEntry): string {
  if (entry.type === 'event') return entry.item.title;
  if (entry.type === 'expense') return entry.expense.description;
  if (entry.type === 'lemon') return entry.log.note ?? entry.log.careTypes.join('+');
  return entry.memo.body;
}

describe('timeline service', () => {
  beforeEach(async () => {
    ({ userId, partnerId } = await resetUsers());
  });

  it('予定・タスク・立替・レモンを 1 本に新しい順で並べ、24 時間より先の予定は出さない', async () => {
    await createEvent(
      event({
        title: '明日の朝',
        startsAt: iso('2026-09-15T09:00:00'),
        endsAt: iso('2026-09-15T10:00:00'),
      }),
      userId,
    );
    await createEvent(
      event({
        title: '明後日',
        startsAt: iso('2026-09-16T09:00:00'),
        endsAt: iso('2026-09-16T10:00:00'),
      }),
      userId,
    );
    await createEvent(
      event({
        title: '昨日の会議',
        startsAt: iso('2026-09-13T15:00:00'),
        endsAt: iso('2026-09-13T16:00:00'),
      }),
      userId,
    );
    await logCare(
      { careTypes: ['water'], doneAt: jst('2026-09-14T08:00:00'), note: '朝の水やり' },
      { userId },
    );
    await addExpense(
      expenseSchema.parse({
        fromUserId: userId,
        toUserId: partnerId,
        amount: 800,
        description: 'ランチ',
        spentOn: '2026-09-12',
      }),
      userId,
    );
    await createEvent(task({ title: '開始済み', startsAt: iso('2026-09-10T09:00:00') }), userId);

    const page = await getTimelinePage({}, now);
    expect(labels(page.items)).toEqual([
      '開始済み',
      '明日の朝',
      '朝の水やり',
      '昨日の会議',
      'ランチ',
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('タスクは完了した日時に置き、未完了で開始を過ぎたものは一番上にまとめる', async () => {
    const done = await createEvent(
      task({ title: '完了', startsAt: iso('2026-09-01T09:00:00') }),
      userId,
    );
    await completeEvent(done.id, {}, userId, jst('2026-09-13T20:00:00'));
    await createEvent(task({ title: '今朝開始', startsAt: iso('2026-09-14T08:00:00') }), userId);
    await createEvent(task({ title: '開始済み', startsAt: iso('2026-09-10T09:00:00') }), userId);
    const allDay = { allDay: true, startsAt: iso('2026-09-12T00:00:00') };
    await createEvent(task({ title: '一昨日（先）', ...allDay }), userId);
    await createEvent(task({ title: '一昨日（後）', ...allDay }), userId);
    // 開始がまだ先なら、その位置に置く
    await createEvent(task({ title: '明日開始', startsAt: iso('2026-09-15T08:00:00') }), userId);

    const page = await getTimelinePage({}, now);
    // 開始を過ぎたものは開始の古い順、開始が同じなら登録の古い順
    expect(labels(page.items)).toEqual([
      '開始済み',
      '一昨日（先）',
      '一昨日（後）',
      '今朝開始',
      '明日開始',
      '完了',
    ]);
    expect(
      page.items.find((e) => e.type === 'event' && e.item.title === '今朝開始')?.at,
    ).toBeNull();
  });

  it('終日の予定は今日を含めば今日、過ぎていれば終わる日、まだなら始まる日の終わりに置く', async () => {
    const allDay = (title: string, from: string, to: string) =>
      createEvent(event({ title, allDay: true, startsAt: iso(from), endsAt: iso(to) }), userId);
    await allDay('先週の連休', '2026-09-07T00:00:00', '2026-09-09T00:00:00');
    await allDay('今日の終日', '2026-09-14T00:00:00', '2026-09-14T00:00:00');
    // 同じ位置の行は、後に作ったもの（id が大きい）が上
    await allDay('今日と明日', '2026-09-14T00:00:00', '2026-09-15T00:00:00');
    await allDay('明日の終日', '2026-09-15T00:00:00', '2026-09-15T00:00:00');
    await allDay('明後日の終日', '2026-09-16T00:00:00', '2026-09-16T00:00:00');
    await createEvent(
      event({
        title: '夕方',
        startsAt: iso('2026-09-14T18:00:00'),
        endsAt: iso('2026-09-14T19:00:00'),
      }),
      userId,
    );
    await createEvent(
      event({
        title: '明日の朝',
        startsAt: iso('2026-09-15T09:00:00'),
        endsAt: iso('2026-09-15T10:00:00'),
      }),
      userId,
    );
    await createEvent(task({ title: '開始済み', startsAt: iso('2026-09-10T09:00:00') }), userId);
    const done = await createEvent(
      task({ title: '今朝完了', startsAt: iso('2026-09-14T07:00:00') }),
      userId,
    );
    await completeEvent(done.id, {}, userId, jst('2026-09-14T08:00:00'));

    const page = await getTimelinePage({}, now);
    expect(labels(page.items)).toEqual([
      '開始済み',
      '明日の終日',
      '明日の朝',
      '今日と明日',
      '今日の終日',
      '夕方',
      '今朝完了',
      '先週の連休',
    ]);
    expect(page.items.find((e) => label(e) === '今日と明日')?.at).toBe(
      iso('2026-09-14T23:59:59.999'),
    );

    // 終わった予定は終わる日に置く。今日に置いた予定は、今日より前のページには出さない
    const earlier = await getTimelinePage({ before: day('2026-09-14') }, now);
    expect(labels(earlier.items)).toEqual(['先週の連休']);
    expect(earlier.items[0]?.at).toBe(iso('2026-09-09T23:59:59.999'));
  });

  it('ページの件数を超える記録は日の切れ目で分け、記録の無い期間を空のページで読み続けない', async () => {
    // 1 日 1 回の世話を 60 日分（ページの件数より多い）
    // ずっと前の記録も 1 件。間には何も無い
    await Promise.all([
      ...Array.from({ length: 60 }, (_, i) => {
        const doneAt = new Date(jst('2026-09-14T07:00:00').getTime() - i * 86_400_000);
        return logCare({ careTypes: ['mist'], doneAt, note: null }, { userId });
      }),
      logCare({ careTypes: [], doneAt: jst('2025-01-01T10:00:00'), note: '昔のメモ' }, { userId }),
    ]);

    const first = await getTimelinePage({}, now);
    expect(first.nextCursor).not.toBeNull();
    // 日の途中では切らない: 続きはこのページの最も古い日より前から
    expect(first.nextCursor).toBe(first.items[0]?.at && dayOf(first.items[0].at));
    const second = await getTimelinePage({ before: day(first.nextCursor ?? '') }, now);
    // 2 ページ目で昔の記録まで届き、そこで終わる
    expect(labels(second.items).at(-1)).toBe('昔のメモ');
    expect(second.nextCursor).toBeNull();
    // 重なりも抜けも無い
    expect(first.items.length + second.items.length).toBe(61);
  });

  it('繰り返す予定の回はページを分けても 1 回ずつ出る', async () => {
    await createEvent(
      event({
        title: '朝会',
        startsAt: iso('2026-06-01T09:00:00'),
        endsAt: iso('2026-06-01T09:30:00'),
        rrule: 'FREQ=DAILY',
      }),
      userId,
    );
    const pages: TimelineEntry[][] = [];
    let before: string | null | undefined;
    do {
      const page = await getTimelinePage(before ? { before: day(before) } : {}, now);
      pages.push(page.items);
      before = page.nextCursor;
    } while (before);
    const starts = pages.flat().map((e) => e.at);
    // 6/1 から 9/15（24 時間先）まで毎日 1 回
    expect(starts).toHaveLength(107);
    expect(new Set(starts).size).toBe(starts.length);
  });

  it('キーワードはどの種類のタイトル・メモにも当たり、レモンは項目の名前でも見つかる', async () => {
    await createEvent(
      event({
        title: '買い物',
        startsAt: iso('2026-09-13T15:00:00'),
        endsAt: iso('2026-09-13T16:00:00'),
      }),
      userId,
    );
    await createEvent(
      task({ title: '掃除', note: '買い物のついで', startsAt: iso('2026-09-10T09:00:00') }),
      userId,
    );
    await logCare(
      { careTypes: ['water'], doneAt: jst('2026-09-14T08:00:00'), note: null },
      { userId },
    );
    await logCare(
      { careTypes: ['mist'], doneAt: jst('2026-09-14T08:10:00'), note: null },
      { userId },
    );

    expect(labels((await getTimelinePage({ q: '買い物' }, now)).items)).toEqual(['掃除', '買い物']);
    expect(labels((await getTimelinePage({ q: '水やり' }, now)).items)).toEqual(['water']);
  });

  it('「この回だけ」で直した回は、繰り返し元に当たらないキーワードでも見つかる', async () => {
    const weekly = {
      title: '朝会',
      startsAt: iso('2026-09-07T09:00:00'),
      endsAt: iso('2026-09-07T09:30:00'),
      rrule: 'FREQ=WEEKLY',
    };
    const master = await createEvent(event(weekly), userId);
    await updateEvent(
      master.id,
      updateEventSchema.parse({
        kind: 'event',
        participantIds: [userId],
        ...weekly,
        title: '歯医者',
        scope: 'this',
        occurrenceStart: weekly.startsAt,
      }),
      userId,
    );

    expect(labels((await getTimelinePage({ q: '歯医者' }, now)).items)).toEqual(['歯医者']);
    expect(labels((await getTimelinePage({ q: '朝会' }, now)).items)).toEqual(['朝会']);
  });

  it('日付の範囲で絞り込むと、その範囲の記録だけを出し、今日に繰り越したタスクは出さない', async () => {
    await createEvent(task({ title: '繰り越し', startsAt: iso('2026-09-03T08:00:00') }), userId);
    for (const [doneAt, note] of [
      ['2026-09-01T08:00:00', '1日'],
      ['2026-09-05T08:00:00', '5日'],
      ['2026-09-10T08:00:00', '10日'],
    ] as const) {
      await logCare({ careTypes: [], doneAt: jst(doneAt), note }, { userId });
    }
    const page = await getTimelinePage({ since: day('2026-09-02'), until: day('2026-09-05') }, now);
    expect(labels(page.items)).toEqual(['5日']);
    expect(page.nextCursor).toBeNull();
  });

  it('メモは書いた人と一緒に、書いた時刻に並ぶ', async () => {
    const realNow = new Date();
    await addMemo({ body: 'ひとこと' }, { userId: partnerId });
    const page = await getTimelinePage({}, realNow);
    expect(page.items).toMatchObject([
      { type: 'memo', memo: { body: 'ひとこと', createdBy: partnerId } },
    ]);
  });

  it('ピン止めしたメモは、絞り込んでいなければ出さず（画面が一番上に固定して出す）、絞り込めばほかのメモと同じに出す', async () => {
    const realNow = new Date();
    const pinned = await addMemo({ body: '固定のメモ' }, { userId });
    await addMemo({ body: 'ふつうのメモ' }, { userId });
    await setMemoPinned(pinned.id, true);
    expect(labels((await getTimelinePage({}, realNow)).items)).toEqual(['ふつうのメモ']);
    expect(labels((await getTimelinePage({ q: 'メモ' }, realNow)).items)).toEqual([
      'ふつうのメモ',
      '固定のメモ',
    ]);
    expect(labels((await getTimelinePage({ q: 'ふつう' }, realNow)).items)).toEqual([
      'ふつうのメモ',
    ]);
    const today = day(dayOf(realNow.toISOString()));
    expect(labels((await getTimelinePage({ since: today }, realNow)).items)).toEqual([
      'ふつうのメモ',
      '固定のメモ',
    ]);
  });
});
