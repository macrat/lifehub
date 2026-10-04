import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { z } from 'zod';
import { TIME_ZONE } from '../../../shared/constants.ts';
import {
  addDays,
  allDayDate,
  type DateRange,
  diffDays,
  isDateString,
  startOfDate,
  today,
} from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import { dateRangeQuerySchema, dateStringSchema } from '../../../shared/validation/common.ts';
import { ValidationError } from '../errors.ts';
import { checkRules } from '../patch.ts';

/**
 * MCP で受け渡す日付・日時。LLM が読み書きしやすいよう、日時はいつも JST（+09:00）の壁時計で出し、
 * 入力はタイムゾーンを省けば JST とみなす。
 * WHY NOT UTC の ISO 8601（API の形）: LLM も人も JST で考えるので、UTC で出すと 9 時間ずらして読み違える。
 * 入力にタイムゾーンを必須にすると、LLM は付け忘れたり、UTC に直し間違えたりする。
 */

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;
const HAS_ZONE = /(Z|[+-]\d{2}:\d{2})$/;

/** 日付だけ（終日）か、時刻を持つ日時か */
export type When = { date: DateString; at?: never } | { at: Date; date?: never };

function parseDateTime(value: string): Date | undefined {
  if (!DATE_TIME.test(value)) return undefined;
  const at = new Date(HAS_ZONE.test(value) ? value : `${value}+09:00`);
  return Number.isNaN(at.getTime()) ? undefined : at;
}

/** 日時の入力。タイムゾーンを省くと JST */
export const instantInputSchema = z.string().transform((value, ctx) => {
  const at = parseDateTime(value);
  if (at) return at;
  ctx.addIssue({
    code: 'custom',
    message: `日時は YYYY-MM-DDTHH:mm（JST）の形で指定してください: ${value}`,
  });
  return z.NEVER;
});

/** 日付（YYYY-MM-DD。終日）か日時（YYYY-MM-DDTHH:mm。タイムゾーンを省くと JST）の入力 */
export const whenInputSchema = z.string().transform((value, ctx): When => {
  if (isDateString(value)) return { date: value };
  const at = parseDateTime(value);
  if (at) return { at };
  ctx.addIssue({
    code: 'custom',
    message: `日付は YYYY-MM-DD、日時は YYYY-MM-DDTHH:mm（JST）の形で指定してください: ${value}`,
  });
  return z.NEVER;
});

/** 入力の日付・日時を瞬間にする。日付はその日の JST 0:00 */
export function instantOf(when: When): Date {
  return when.date !== undefined ? startOfDate(when.date) : when.at;
}

/** 瞬間 → JST の日時（`2030-01-07T09:00+09:00`）。秒は出さない（予定も記録も分までしか意味を持たない） */
export function jstDateTime(value: Date | string): string {
  return format(new TZDate(new Date(value), TIME_ZONE), "yyyy-MM-dd'T'HH:mmXXX");
}

/** 瞬間 → JST の時刻（`09:00`） */
export function jstTime(value: Date | string): string {
  return format(new TZDate(new Date(value), TIME_ZONE), 'HH:mm');
}

/** 予定・タスクの開始・終了（期限）を LLM に返す形にする。終日は日付（終了はその日を含む）、時刻ありは JST の日時 */
export function whenOutput(allDay: boolean, iso: string, edge: 'start' | 'end'): string {
  return allDay ? allDayDate(iso, edge) : jstDateTime(iso);
}

const WEEKDAYS = '日月火水木金土';

/** JST の暦日の曜日（`月`） */
export function weekdayOf(date: DateString): string {
  return WEEKDAYS[new TZDate(startOfDate(date), TIME_ZONE).getDay()] ?? '';
}

/**
 * 期間を読むツールの入力（最初の日・最後の日。どちらも省ける）と、それを期間に直す関数。
 * 省いた端は days 日の期間になるよう埋め（両方省けば今日から）、max 日を越えれば分けて読むよう文で返す
 * （一度に返す量を LLM の文脈に収める）。
 */
export function dateRangeInput(days: number, max: number) {
  const shape = {
    from: dateStringSchema.optional().describe('最初の日（JST の YYYY-MM-DD）。省くと今日'),
    to: dateStringSchema
      .optional()
      .describe(`最後の日（その日を含む）。省くと from から ${days} 日間。期間は ${max} 日まで`),
  };
  const resolve = (input: { from?: DateRange['from']; to?: DateRange['to'] }): DateRange => {
    const from = input.from ?? (input.to ? addDays(input.to, 1 - days) : today());
    const range = { from, to: input.to ?? addDays(from, days - 1) };
    checkRules(range, dateRangeQuerySchema);
    if (diffDays(range.from, range.to) >= max) {
      throw new ValidationError(`期間は ${max} 日までです。分けて読んでください`);
    }
    return range;
  };
  return { shape, resolve };
}
