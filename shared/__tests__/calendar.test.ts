import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type CalendarItem,
  normalizeInstants,
  normalizeIsoInstants,
  occurrenceKey,
  placeOccurrence,
  sortItems,
  taskTime,
  toInputIsoInstants,
} from '../calendar.ts';
import type { DateString } from '../types.ts';
import { jst } from './jst.ts';

const BASE = {
  completedAt: null,
  location: null,
  note: null,
  participantIds: ['u1'],
  rrule: null,
  remindStartMinutes: null,
  remindEndMinutes: null,
  occurrenceStart: null,
  isRecurring: false,
  isModified: false,
};

const day = '2026-09-21' as DateString;

function event(title: string, startsAt: string, endsAt: string, allDay = false): CalendarItem {
  return {
    ...BASE,
    id: title,
    kind: 'event',
    title,
    allDay,
    startsAt,
    endsAt,
    placementDate: day,
    dayIndex: 1,
    dayCount: 1,
  };
}

function task(title: string, startsAt: string, allDay = false): CalendarItem {
  return {
    ...BASE,
    id: title,
    kind: 'task',
    title,
    allDay,
    startsAt,
    endsAt: null,
    placementDate: day,
  };
}

describe('taskTime', () => {
  it('終日のタスクは開始の日付だけを返す', () => {
    // 9/21 0:00 JST 開始の終日
    expect(taskTime(task('終日', '2026-09-20T15:00:00.000Z', true))).toEqual({
      kind: 'start',
      date: '2026-09-21',
      at: null,
    });
    expect(taskTime(task('9 時開始', '2026-09-21T00:00:00.000Z'))).toEqual({
      kind: 'start',
      date: '2026-09-21',
      at: '2026-09-21T00:00:00.000Z',
    });
  });

  it('完了していれば完了の日時', () => {
    const started = task('開始', '2026-09-21T00:00:00.000Z');
    expect(taskTime({ ...started, completedAt: '2026-09-21T05:00:00.000Z' })).toEqual({
      kind: 'done',
      date: '2026-09-21',
      at: '2026-09-21T05:00:00.000Z',
    });
  });
});

describe('sortItems', () => {
  it('同日内は 終日の予定 → 終日のタスク → 時刻のある項目 の順に並ぶ', () => {
    const items = [
      event('10 時の予定', '2026-09-21T01:00:00.000Z', '2026-09-21T02:00:00.000Z'),
      task('12 時開始のタスク', '2026-09-21T03:00:00.000Z'),
      task('終日のタスク', '2026-09-20T15:00:00.000Z', true),
      event('終日の予定', '2026-09-20T15:00:00.000Z', '2026-09-21T15:00:00.000Z', true),
      task('9 時開始のタスク', '2026-09-21T00:00:00.000Z'),
    ];
    expect(sortItems(items).map((i) => i.title)).toEqual([
      '終日の予定',
      '終日のタスク',
      '9 時開始のタスク',
      '10 時の予定',
      '12 時開始のタスク',
    ]);
  });

  it('完了したタスクは、表示と同じ完了の時刻に並ぶ', () => {
    const items = [
      event('11 時の予定', '2026-09-21T02:00:00.000Z', '2026-09-21T03:00:00.000Z'),
      // 前日 9 時開始を 20 時に完了。完了した日に置かれ、行もその日の時間軸も完了の時刻を指すので、並びも 20 時
      {
        ...task('前日開始で 20 時に完了したタスク', '2026-09-20T00:00:00.000Z'),
        completedAt: '2026-09-21T11:00:00.000Z',
      },
    ];
    expect(sortItems(items).map((i) => i.title)).toEqual([
      '11 時の予定',
      '前日開始で 20 時に完了したタスク',
    ]);
  });

  it('日付が違えば placementDate 順に並ぶ', () => {
    const later = {
      ...task('翌日', '2026-09-22T00:00:00.000Z'),
      placementDate: '2026-09-22' as DateString,
    };
    const earlier = { ...event('前日', '2026-09-20T01:00:00.000Z', '2026-09-20T02:00:00.000Z') };
    const items = [later, { ...earlier, placementDate: '2026-09-20' as DateString }];
    expect(sortItems(items).map((i) => i.title)).toEqual(['前日', '翌日']);
  });
});

describe('placeOccurrence', () => {
  it('複数日の予定は掛かる日ごとに 1 件になる（範囲外の日は除く）', () => {
    const occurrence = {
      ...BASE,
      id: 'e1',
      kind: 'event' as const,
      title: '旅行',
      allDay: true,
      // 9/21 0:00 JST 〜 9/24 0:00 JST（終端は排他的 = 9/23 まで）
      startsAt: '2026-09-20T15:00:00.000Z',
      endsAt: '2026-09-23T15:00:00.000Z',
    };
    const items = placeOccurrence(
      occurrence,
      { from: '2026-09-22' as DateString, to: '2026-09-30' as DateString },
      new Date('2026-09-21T03:00:00.000Z'),
    );
    expect(items.map((i) => i.placementDate)).toEqual(['2026-09-22', '2026-09-23']);
    expect(items.map((i) => (i.kind === 'event' ? i.dayIndex : null))).toEqual([2, 3]);
    expect(items.every((i) => i.kind === 'event' && i.dayCount === 3)).toBe(true);
  });
});

describe('occurrenceKey', () => {
  it('複数日の予定の日ごとの項目は同じ発生になる', () => {
    const first = event('trip', '2026-09-21T00:00:00+09:00', '2026-09-23T00:00:00+09:00', true);
    const second = { ...first, placementDate: '2026-09-22' as DateString, dayIndex: 2 };
    expect(occurrenceKey(second)).toBe(occurrenceKey(first));
  });

  it('繰り返しの回・種別・id が違えば別の発生になる', () => {
    const base = { kind: 'event' as const, id: 'a', occurrenceStart: '2026-09-21T00:00:00.000Z' };
    const keys = [
      base,
      { ...base, occurrenceStart: '2026-09-22T00:00:00.000Z' },
      { ...base, occurrenceStart: null },
      { ...base, kind: 'task' as const },
      { ...base, id: 'b' },
    ].map(occurrenceKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('normalizeIsoInstants / toInputIsoInstants', () => {
  it('終日は入力の「含む最終日」と保存の「翌日 0:00」を行き来する。終了の無いものは null のまま', () => {
    // 9/21〜9/22 の終日（JST）
    const input = { startsAt: '2026-09-20T15:00:00.000Z', endsAt: '2026-09-21T15:00:00.000Z' };
    const saved = normalizeIsoInstants(true, input.startsAt, input.endsAt);
    expect(saved).toEqual({ startsAt: input.startsAt, endsAt: '2026-09-22T15:00:00.000Z' });
    expect(toInputIsoInstants(true, saved.startsAt, saved.endsAt)).toEqual({
      startsAt: input.startsAt,
      endsAt: '2026-09-22T14:59:59.999Z',
    });
    expect(normalizeIsoInstants(true, input.startsAt, null)).toEqual({
      startsAt: input.startsAt,
      endsAt: null,
    });
  });

  it('時間指定はそのまま', () => {
    const at = '2026-09-21T01:23:00.000Z';
    expect(normalizeIsoInstants(false, at, null)).toEqual({ startsAt: at, endsAt: null });
    expect(toInputIsoInstants(false, at, at)).toEqual({ startsAt: at, endsAt: at });
  });
});

describe('normalizeInstants', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('終日の終了は、実行環境のタイムゾーンに夏時間があっても翌日の JST 0:00 になる', () => {
    // 2031-03-09 は米国東部の夏時間の始まり。実行環境の暦日で 1 日足すと 1 時間ずれる
    // Node は環境変数 TZ の書き換えをその場で反映する
    vi.stubEnv('TZ', 'America/New_York');
    const day = jst('2031-03-09T00:00:00');
    expect(normalizeInstants(true, day, day)).toEqual({
      startsAt: day,
      endsAt: jst('2031-03-10T00:00:00'),
    });
  });
});
