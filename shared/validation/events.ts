import { z } from 'zod';
import { dateRangeQuerySchema, instantSchema, uuidSchema } from './common.ts';

export const REMIND_BEFORE_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 1440] as const;

/** RRULE 文字列（DTSTART なし）。厳密な検証はサーバーの recurrence ライブラリで行う。 */
export const rruleSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((v) => /FREQ=/i.test(v), '繰り返しルールには FREQ が必要です');

const eventFields = {
  title: z.string().trim().min(1, 'タイトルを入力してください').max(200),
  allDay: z.boolean().default(false),
  startsAt: instantSchema,
  endsAt: instantSchema,
  /** null = 共有 */
  ownerUserId: uuidSchema.nullable().default(null),
  location: z.string().trim().max(200).nullable().default(null),
  note: z.string().trim().max(2000).nullable().default(null),
  /** null = 単発 */
  rrule: rruleSchema.nullable().default(null),
  /** null = 通知なし（既定） */
  remindBeforeMinutes: z
    .union(REMIND_BEFORE_OPTIONS.map((v) => z.literal(v)))
    .nullable()
    .default(null),
};

export const createEventSchema = z
  .object(eventFields)
  .refine((v) => v.endsAt.getTime() >= v.startsAt.getTime(), {
    message: '終了日時は開始日時以降にしてください',
    path: ['endsAt'],
  });
export type CreateEventInput = z.infer<typeof createEventSchema>;

/** 繰り返しの編集・削除の範囲。単発の予定では `all` 扱い。 */
export const recurrenceScopeSchema = z.enum(['all', 'this', 'following']);
export type RecurrenceScope = z.infer<typeof recurrenceScopeSchema>;

const scopeFields = {
  scope: recurrenceScopeSchema.default('all'),
  /** scope が this / following のとき必須: 対象の発生の元の開始日時 */
  occurrenceStart: instantSchema.optional(),
};

const requireOccurrenceStart = (v: { scope: RecurrenceScope; occurrenceStart?: Date }) =>
  v.scope === 'all' || v.occurrenceStart !== undefined;
const occurrenceStartMessage = {
  message: 'この回だけ／これ以降を指定するときは occurrenceStart が必要です',
  path: ['occurrenceStart'],
};

export const updateEventSchema = z
  .object({ ...eventFields, ...scopeFields })
  .refine((v) => v.endsAt.getTime() >= v.startsAt.getTime(), {
    message: '終了日時は開始日時以降にしてください',
    path: ['endsAt'],
  })
  .refine(requireOccurrenceStart, occurrenceStartMessage);
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const deleteEventSchema = z
  .object(scopeFields)
  .refine(requireOccurrenceStart, occurrenceStartMessage);
export type DeleteEventInput = z.infer<typeof deleteEventSchema>;

export const listEventsQuerySchema = dateRangeQuerySchema;
