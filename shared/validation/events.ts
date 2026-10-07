import { z } from 'zod';
import { clientIdShape, instantSchema, instantSchemaWith, participantIdsSchema } from './common.ts';

export const EVENT_KINDS = ['event', 'task'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const REMIND_BEFORE_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 1440] as const;
export type RemindMinutes = (typeof REMIND_BEFORE_OPTIONS)[number];

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

/** 通知の n 分前。null = 通知なし */
const remindMinutesSchema = z.union(REMIND_BEFORE_OPTIONS.map((v) => z.literal(v))).nullable();

/**
 * 予定・タスクの日時以外の項目の型。既定値は持たせない: 部分更新（MCP の予定の更新）では
 * 「省いた（今の値のまま）」と「null にする（消す）」を見分ける必要があり、既定値があると
 * 省いた項目が既定値で埋まってしまう（zod の partial は既定値を外さない）。
 * MCP は項目の名前と日時の形を LLM に合わせて変えるが、項目ごとの規則（長さ・選択肢）はここから取る。
 * 日時は形（入力の文字列か、検証済みの Date か）で型が変わるので `eventSchemaWith` が組む。
 */
export const eventFieldTypes = {
  kind: z.enum(EVENT_KINDS),
  title: z.string().trim().min(1, 'タイトルを入力してください').max(200),
  allDay: z.boolean(),
  /** 1 人以上 */
  participantIds: participantIdsSchema,
  location: z.string().trim().max(200).nullable(),
  note: z.string().trim().max(2000).nullable(),
  /** null = 単発。DTSTART は startsAt */
  rrule: rruleSchema.nullable(),
  /** 開始の n 分前に通知 */
  remindStartMinutes: remindMinutesSchema,
  /** 予定の終了の n 分前に通知 */
  remindEndMinutes: remindMinutesSchema,
};

/**
 * 予定・タスクの形（種別 kind の判別共用体）。作成・更新（全項目の置き換え）の項目で、省いた項目は既定
 * （終日でない・通知なし など）になる。予定は終了を必ず持ち、タスクは終わり（終了・その前の通知）を持たない。
 * WHY 判別共用体: 予定とタスクで違う項目を形そのもので分け、検証を通った値の型からも
 * 「タスクの終了」を読めなくする。
 * WHY NOT 黙って捨てる（タスクの終わり）: 渡された終わりを消して保存すると、送った側は保存されたと思い込む。
 * 日時の型を引数にするのは、API の入力（ISO 文字列 → Date）と、部分更新を今の値に重ねた後の値（Date のまま）を
 * 同じ形と規則で確かめるため（`createEventSchema` / `eventRulesSchema`）。
 */
function eventSchemaWith<I extends z.ZodType<Date>>(
  /** 日時の型を、空や形の誤りのときに入力欄へ出す言葉ごとに作る */
  instant: (error: string) => I,
) {
  const common = {
    title: eventFieldTypes.title,
    allDay: eventFieldTypes.allDay.default(false),
    /** 予定もタスクも必須。タスクは開始の日（終日）か日時だけを持つ */
    startsAt: instant('開始日時を入力してください'),
    participantIds: eventFieldTypes.participantIds,
    location: eventFieldTypes.location.default(null),
    note: eventFieldTypes.note.default(null),
    rrule: eventFieldTypes.rrule.default(null),
    remindStartMinutes: eventFieldTypes.remindStartMinutes.default(null),
  };
  return z.discriminatedUnion('kind', [
    z.object({
      ...common,
      kind: z.literal('event'),
      endsAt: instant('終了日時を入力してください'),
      remindEndMinutes: eventFieldTypes.remindEndMinutes.default(null),
    }),
    z.object({
      ...common,
      kind: z.literal('task'),
      endsAt: z.null({ error: 'タスクは終了日時を持てません' }).default(null),
      remindEndMinutes: z.null({ error: 'タスクは終了前の通知を持てません' }).default(null),
    }),
  ]);
}

/** 予定・タスクの項目（検証後）。組み合わせの規則（下の refine）はこの形を読む */
export type CreateEventInput = z.output<typeof inputEventSchema>;

const endAfterStart = (v: CreateEventInput) =>
  v.endsAt === null || v.endsAt.getTime() >= v.startsAt.getTime();
const endMessage = { message: '終了日時は開始日時以降にしてください', path: ['endsAt'] };
/** 終日の通知は日単位だけ（`ALL_DAY_REMIND_OPTIONS`）。誤りはその通知の欄に出す */
const allDayRemindRule = (
  field: 'remindStartMinutes' | 'remindEndMinutes',
): [(v: CreateEventInput) => boolean, { message: string; path: string[] }] => [
  (v: CreateEventInput) => {
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

/**
 * 予定・タスクの項目をまたぐ規則。作成と更新（と MCP の部分更新を重ねた後の値）が同じ規則を通るよう、
 * 規則はここ 1 か所に並べ、スキーマの形（回の指定の有無）とは切り離す。
 */
function withEventRules<T extends z.ZodType<CreateEventInput>>(schema: T): T {
  return schema
    .refine(endAfterStart, endMessage)
    .refine(...allDayRemindRule('remindStartMinutes'))
    .refine(...allDayRemindRule('remindEndMinutes'));
}

const inputEventSchema = eventSchemaWith(instantSchemaWith);

export const createEventSchema = withEventRules(inputEventSchema);

/**
 * 種別で分ける前の平らな値。予定とタスクの項目を 1 つの形に並べたもので、DB の行から組み立てた今の値や、
 * MCP が LLM の入力から組み立てた値はこの形で持ち、書き込む所で `eventRulesSchema` を通して種別の形にする。
 */
export type EventValues = { [K in keyof CreateEventInput]: CreateEventInput[K] };

/**
 * 部分更新（MCP の予定の更新）。省いた項目は今の値のまま、null は消す。
 * 種別を変えるときは、画面と同じく開始だけを引き継ぐ（`patchEvent`）。
 * 形と組み合わせの規則は、今の値に重ねた後で `eventRulesSchema` が確かめる。
 */
export type EventPatch = Partial<EventValues>;

/** 検証済みの日時（Date）の値を、API の入力と同じ形と規則で確かめて種別の形にする（部分更新を重ねた後の値など） */
export const eventRulesSchema = withEventRules(eventSchemaWith((error) => z.date({ error })));

/** API（`events.create`）が受け取る作成の入力（`clientIdShape`） */
export const createEventRequestSchema = withEventRules(
  inputEventSchema.and(z.object(clientIdShape)),
);

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
  z.object({ scope: recurrenceScopeSchema.extract(['all']) }),
  z.object({
    scope: recurrenceScopeSchema.exclude(['all']),
    occurrenceStart: instantSchema,
  }),
]);
export type OccurrenceTarget = z.infer<typeof occurrenceTargetSchema>;

export const updateEventSchema = withEventRules(inputEventSchema.and(occurrenceTargetSchema));

/** 完了・完了取り消し（タスクのみ）。繰り返しでは occurrenceStart で回を指定する（完了は常に 1 つの回に対して行う） */
export const completeEventSchema = z.object({
  /** 繰り返しの回を指す元の発生の基準日時。単発では省略 */
  occurrenceStart: instantSchema.optional(),
});
export type CompleteEventInput = z.infer<typeof completeEventSchema>;

/**
 * API（`events.complete`）が受け取る完了の入力。完了日時は押した端末が決めて送る。
 * WHY: 送れない書き込みは端末に溜めて後で送る（docs/architecture.md「オフラインの書き込み」）ので、
 * サーバーが受け取った時刻にすると、オフラインで押した完了や送り直した完了が実際より後の日時になる。
 * 省略はサーバーの今（MCP は今の日時を正確に知らないので渡させない）。
 */
export const completeEventRequestSchema = completeEventSchema.extend({
  completedAt: instantSchema.optional(),
});
