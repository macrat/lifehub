import { z } from 'zod';
import { newId } from '../id.ts';
import { instantSchema, participantIdsSchema, uuidSchema } from './common.ts';

const EVENT_KINDS = ['event', 'task'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const REMIND_BEFORE_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 1440] as const;

/**
 * 終日の項目の通知の選択肢: 0 = 当日、1440 = 前日（どちらも各自の通知時刻に送る）。
 * 終日には「n 分前」の瞬間が無い（0:00 の n 分前では夜中に届く）ので、日単位だけを許す。
 */
export const ALL_DAY_REMIND_OPTIONS = [0, 1440] as const;
export type AllDayRemind = (typeof ALL_DAY_REMIND_OPTIONS)[number];
const [SAME_DAY, DAY_BEFORE] = ALL_DAY_REMIND_OPTIONS;

/** 時刻のある項目の通知を終日の選択肢に寄せる（0 分前は当日、それ以外は前日）。終日へ切り替えるフォームが使う */
export function toAllDayRemind(minutes: number | null): AllDayRemind | null {
  if (minutes === null) return null;
  return minutes === 0 ? SAME_DAY : DAY_BEFORE;
}

/** RRULE 文字列（DTSTART なし）。厳密な検証はサーバーの recurrence ライブラリで行う。 */
const rruleSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((v) => /FREQ=/i.test(v), '繰り返しルールには FREQ が必要です');

/** 通知の n 分前。null = 通知なし（既定） */
const remindMinutesSchema = z
  .union(REMIND_BEFORE_OPTIONS.map((v) => z.literal(v)))
  .nullable()
  .default(null);

const eventFields = {
  kind: z.enum(EVENT_KINDS),
  title: z.string().trim().min(1, 'タイトルを入力してください').max(200),
  allDay: z.boolean().default(false),
  /** 予定では必須。タスクでは任意 */
  startsAt: instantSchema.nullable().default(null),
  /** 予定では必須（終了）。タスクでは期限（任意） */
  endsAt: instantSchema.nullable().default(null),
  /** 1 人以上 */
  participantIds: participantIdsSchema,
  location: z.string().trim().max(200).nullable().default(null),
  note: z.string().trim().max(2000).nullable().default(null),
  /** null = 単発。繰り返すには startsAt か endsAt の少なくとも一方が必要（DTSTART になる） */
  rrule: rruleSchema.nullable().default(null),
  /** 開始の n 分前に通知 */
  remindStartMinutes: remindMinutesSchema,
  /** 終了（期限）の n 分前に通知 */
  remindEndMinutes: remindMinutesSchema,
};

type EventFieldsOutput = {
  kind: EventKind;
  allDay: boolean;
  remindStartMinutes: number | null;
  remindEndMinutes: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  rrule: string | null;
};

const eventHasRange = (v: EventFieldsOutput) =>
  v.kind !== 'event' || (v.startsAt !== null && v.endsAt !== null);
const eventRangeMessage = { message: '開始日時と終了日時を入力してください', path: ['startsAt'] };
const endAfterStart = (v: EventFieldsOutput) =>
  v.startsAt === null || v.endsAt === null || v.endsAt.getTime() >= v.startsAt.getTime();
const endMessage = { message: '終了日時は開始日時以降にしてください', path: ['endsAt'] };
/** 終日の通知は日単位だけ（`ALL_DAY_REMIND_OPTIONS`）。誤りはその通知の欄に出す */
const allDayRemindRule = (
  field: 'remindStartMinutes' | 'remindEndMinutes',
): [(v: EventFieldsOutput) => boolean, { message: string; path: string[] }] => [
  (v: EventFieldsOutput) => {
    const minutes = v[field];
    return (
      !v.allDay ||
      minutes === null ||
      (ALL_DAY_REMIND_OPTIONS as readonly number[]).includes(minutes)
    );
  },
  {
    message: `終日の通知は当日（${SAME_DAY}）か前日（${DAY_BEFORE}）です`,
    path: [field],
  },
];
const recurrenceHasBase = (v: EventFieldsOutput) =>
  v.rrule === null || v.startsAt !== null || v.endsAt !== null;
const recurrenceMessage = {
  message: '繰り返すには開始日時か終了日時のどちらかが必要です',
  path: ['rrule'],
};

export const createEventSchema = z
  .object(eventFields)
  .refine(eventHasRange, eventRangeMessage)
  .refine(endAfterStart, endMessage)
  .refine(...allDayRemindRule('remindStartMinutes'))
  .refine(...allDayRemindRule('remindEndMinutes'))
  .refine(recurrenceHasBase, recurrenceMessage);
export type CreateEventInput = z.infer<typeof createEventSchema>;

/**
 * API（POST /api/events）が受け取る作成の入力。行の ID をクライアントが決めて送れる。
 * WHY: オフラインで作った項目をオンラインに戻る前に編集・削除でき（ID が仮のものにならない）、
 * 通信が切れて送り直しても同じ行になる（二重に作られない）。
 * WHY NOT createEventSchema そのものに持たせない: MCP は ID を考える必要がなく、持たせると
 * ツールの入力欄が増えて誤った ID を渡す余地ができる。省略時はサーバーが採番する。
 */
export const createEventRequestSchema = createEventSchema.safeExtend({
  id: uuidSchema.default(newId),
});

/** 繰り返しの編集・削除の範囲。単発では `all` 扱い。 */
const recurrenceScopeSchema = z.enum(['all', 'this', 'following']);
export type RecurrenceScope = z.infer<typeof recurrenceScopeSchema>;

/**
 * 書き込み（更新・削除）が指す回。all 以外は、繰り返しの回を指す元の発生の基準日時が要る。
 * 判別共用体にして、「this なのに基準日時が無い」組み合わせを検証を通った型に残さない
 * （サーバーは基準日時の有無を確かめ直さず、クライアントは送れない組み合わせを作れない）。
 * scope は省略させない。この API を呼ぶのは自分のクライアントだけで、常に範囲を決めてから送る。
 * 単発の予定に this / following が来ても、サーバーは all として扱う（回が 1 つしかない）。
 */
export const occurrenceTargetSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('all') }),
  z.object({
    scope: z.enum(['this', 'following']),
    occurrenceStart: instantSchema,
  }),
]);
export type OccurrenceTarget = z.infer<typeof occurrenceTargetSchema>;

export const updateEventSchema = z
  .object(eventFields)
  .and(occurrenceTargetSchema)
  .refine(eventHasRange, eventRangeMessage)
  .refine(endAfterStart, endMessage)
  .refine(...allDayRemindRule('remindStartMinutes'))
  .refine(...allDayRemindRule('remindEndMinutes'))
  .refine(recurrenceHasBase, recurrenceMessage);
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

/** 完了・完了取り消し（タスクのみ）。繰り返しでは occurrenceStart で回を指定する（完了は常に 1 つの回に対して行う） */
export const completeEventSchema = z.object({
  /** 繰り返しの回を指す元の発生の基準日時。単発では省略 */
  occurrenceStart: instantSchema.optional(),
});
export type CompleteEventInput = z.infer<typeof completeEventSchema>;
