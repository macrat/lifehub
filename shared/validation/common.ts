import { z } from 'zod';
import { isDateString } from '../date.ts';
import type { DateString } from '../types.ts';

/** JST の暦日（YYYY-MM-DD） */
export const dateStringSchema = z
  .string()
  .refine(isDateString, '日付は YYYY-MM-DD 形式で指定してください')
  .transform((v) => v as DateString);

/** ISO 8601 の日時。Date に変換する。 */
export const instantSchema = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

/** 期間指定（両端を含む JST 暦日） */
export const dateRangeQuerySchema = z
  .object({ from: dateStringSchema, to: dateStringSchema })
  .refine((v) => v.from <= v.to, { message: 'from は to 以前にしてください' });

export const uuidSchema = z.uuid();
