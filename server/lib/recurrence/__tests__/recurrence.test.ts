import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../errors.ts';
import { expandOccurrences, normalizeRRule, withUntilBefore } from '../index.ts';

const jst = (s: string) => new Date(`${s}+09:00`);

describe('normalizeRRule', () => {
  it.each([
    'FREQ=DAILY;INTERVAL=0',
    'FREQ=WEEKLY;INTERVAL=-1',
    'FREQ=MONTHLY;COUNT=-1',
    'FREQ=DAILY;COUNT=0',
  ])('展開が進まない入力を拒否する: %s', (rule) => {
    expect(() => normalizeRRule(rule)).toThrow(ValidationError);
  });
  it('既存データの不正な間隔も展開前に拒否する', () => {
    expect(() =>
      expandOccurrences({
        rrule: 'FREQ=DAILY;INTERVAL=0',
        dtstart: jst('2026-09-01T00:00:00'),
        from: jst('2026-09-01T00:00:00'),
        to: jst('2026-09-02T00:00:00'),
      }),
    ).toThrow(ValidationError);
  });
  it('正規形に整える', () => {
    expect(normalizeRRule('rrule:freq=weekly;byday=mo')).toBe('FREQ=WEEKLY;BYDAY=MO');
  });
  it('DTSTART や不正な文字列は拒否する', () => {
    expect(() => normalizeRRule('DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY')).toThrow(
      ValidationError,
    );
    expect(() => normalizeRRule('hello')).toThrow(ValidationError);
    expect(() => normalizeRRule('FREQ=HOURLY')).toThrow(ValidationError);
  });
});

describe('expandOccurrences', () => {
  it('毎週の発生を JST の壁時計で展開する', () => {
    const result = expandOccurrences({
      rrule: 'FREQ=WEEKLY',
      dtstart: jst('2026-09-07T09:00:00'),
      from: jst('2026-09-01T00:00:00'),
      to: jst('2026-10-01T00:00:00'),
    });
    expect(result.map((d) => d.toISOString())).toEqual([
      '2026-09-07T00:00:00.000Z',
      '2026-09-14T00:00:00.000Z',
      '2026-09-21T00:00:00.000Z',
      '2026-09-28T00:00:00.000Z',
    ]);
  });

  it('毎月末日など月をまたぐ日付も JST 基準で扱う', () => {
    const result = expandOccurrences({
      rrule: 'FREQ=MONTHLY;BYMONTHDAY=1',
      dtstart: jst('2026-01-01T00:30:00'),
      from: jst('2026-02-01T00:00:00'),
      to: jst('2026-04-01T00:00:00'),
    });
    expect(result.map((d) => d.toISOString())).toEqual([
      '2026-01-31T15:30:00.000Z',
      '2026-02-28T15:30:00.000Z',
    ]);
  });

  it('UNTIL は JST の壁時計として解釈する', () => {
    const result = expandOccurrences({
      rrule: 'FREQ=DAILY;UNTIL=20260903T235959',
      dtstart: jst('2026-09-01T23:30:00'),
      from: jst('2026-09-01T00:00:00'),
      to: jst('2026-09-30T00:00:00'),
    });
    expect(result.map((d) => d.toISOString())).toEqual([
      '2026-09-01T14:30:00.000Z',
      '2026-09-02T14:30:00.000Z',
      '2026-09-03T14:30:00.000Z',
    ]);
  });

  it('COUNT を尊重し、to は排他的', () => {
    const result = expandOccurrences({
      rrule: 'FREQ=DAILY;COUNT=2',
      dtstart: jst('2026-09-01T10:00:00'),
      from: jst('2026-09-01T00:00:00'),
      to: jst('2026-09-02T10:00:00'),
    });
    expect(result).toHaveLength(1);
  });
});

describe('withUntilBefore', () => {
  it('指定した発生の直前で終わる', () => {
    const rrule = withUntilBefore('FREQ=WEEKLY', jst('2026-09-21T09:00:00'));
    expect(rrule).toBe('FREQ=WEEKLY;UNTIL=20260921T085959Z');
    const result = expandOccurrences({
      rrule,
      dtstart: jst('2026-09-07T09:00:00'),
      from: jst('2026-09-01T00:00:00'),
      to: jst('2026-12-01T00:00:00'),
    });
    expect(result).toHaveLength(2);
  });
});

describe('expandOccurrences の前後の先読み', () => {
  const daily = { rrule: 'FREQ=DAILY', dtstart: jst('2026-09-01T08:00:00') };

  it('窓の手前の発生を lookbehind の個数だけ足す', () => {
    const result = expandOccurrences({
      ...daily,
      from: jst('2026-09-05T00:00:00'),
      to: jst('2026-09-06T00:00:00'),
      lookbehind: 2,
    });
    expect(result.map((d) => d.toISOString())).toEqual([
      '2026-09-02T23:00:00.000Z',
      '2026-09-03T23:00:00.000Z',
      '2026-09-04T23:00:00.000Z',
    ]);
  });

  it('窓の後ろの発生を lookahead の個数だけ足す', () => {
    const result = expandOccurrences({
      ...daily,
      from: jst('2026-09-01T00:00:00'),
      to: jst('2026-09-03T00:00:00'),
      lookahead: 2,
    });
    expect(result.map((d) => d.toISOString())).toEqual([
      '2026-08-31T23:00:00.000Z',
      '2026-09-01T23:00:00.000Z',
      '2026-09-02T23:00:00.000Z',
      '2026-09-03T23:00:00.000Z',
    ]);
  });

  it('終わりの無いルールでも先読みの分で走査を打ち切る', () => {
    expect(
      expandOccurrences({
        ...daily,
        from: jst('2026-09-01T00:00:00'),
        to: jst('2026-09-01T00:00:01'),
        lookahead: 3,
      }),
    ).toHaveLength(3);
  });

  it('足りない分は黙って少なく返す（COUNT で尽きる場合）', () => {
    expect(
      expandOccurrences({
        rrule: 'FREQ=DAILY;COUNT=3',
        dtstart: daily.dtstart,
        from: jst('2026-09-02T00:00:00'),
        to: jst('2026-09-03T00:00:00'),
        lookbehind: 5,
        lookahead: 5,
      }),
    ).toHaveLength(3);
  });
});
