import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { z } from 'zod';
import { TIME_ZONE } from '../../../shared/constants.ts';
import { inclusiveEndDate, isDateString, startOfDate, toDateString } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';

/**
 * MCP で受け渡す日付・日時。LLM が読み書きしやすいよう、日時はいつも JST（+09:00）の壁時計で出し、
 * 入力はタイムゾーンを省けば JST とみなす。
 * WHY NOT UTC の ISO 8601（API の形）: LLM も人も JST で考えるので、UTC で出すと 9 時間ずらして読み違える。
 * 入力にタイムゾーンを必須にすると、LLM は付け忘れたり、UTC に直し間違えたりする。
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
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
  if (DATE.test(value) && isDateString(value)) return { date: value };
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

/** 終日の項目の開始日・終了日（含む）と、時刻のある項目の日時を、それぞれ LLM に返す形にする */
export function startOutput(allDay: boolean, startsAt: string): string {
  return allDay ? toDateString(new Date(startsAt)) : jstDateTime(startsAt);
}
export function endOutput(allDay: boolean, endsAt: string): string {
  return allDay ? inclusiveEndDate(endsAt) : jstDateTime(endsAt);
}

const WEEKDAYS = '日月火水木金土';

/** JST の暦日の曜日（`月`） */
export function weekdayOf(date: DateString): string {
  return WEEKDAYS[new TZDate(startOfDate(date), TIME_ZONE).getDay()] ?? '';
}
