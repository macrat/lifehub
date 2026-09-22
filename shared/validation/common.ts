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

/**
 * 参加者（ユーザー ID の集合）。1 人以上で、重複は落とす。
 * 予定・タスクの参加者（`events.ts`）と、配信 URL に表示する対象者（`calendar-feeds.ts`）が
 * 同じ選択（`ParticipantsField`）から来るので、規則と文面はここ 1 か所に置く。
 */
export const participantIdsSchema = z
  .array(uuidSchema)
  .min(1, '参加者を 1 人以上選んでください')
  .transform((ids) => [...new Set(ids)]);
