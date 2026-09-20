import { z } from 'zod';
import { instantSchema, uuidSchema } from './common.ts';
import { recurrenceScopeSchema, rruleSchema } from './events.ts';

/** 単発タスクの occurrenceKey */
export const SINGLE_OCCURRENCE_KEY = 'single';

const taskFields = {
  title: z.string().trim().min(1, 'タイトルを入力してください').max(200),
  note: z.string().trim().max(2000).nullable().default(null),
  /** null = 共有 */
  assigneeUserId: uuidSchema.nullable().default(null),
  startsAt: instantSchema.nullable().default(null),
  dueAt: instantSchema.nullable().default(null),
  /** null = 単発。繰り返すには startsAt か dueAt の少なくとも一方が必要（DTSTART になる） */
  rrule: rruleSchema.nullable().default(null),
  notifyAtStart: z.boolean().default(false),
  notifyAtDue: z.boolean().default(false),
};

type TaskFieldsOutput = { startsAt: Date | null; dueAt: Date | null; rrule: string | null };

const requireBaseForRecurrence = (v: TaskFieldsOutput) =>
  v.rrule === null || v.startsAt !== null || v.dueAt !== null;
const recurrenceMessage = {
  message: '繰り返すには開始日時か期限日時のどちらかが必要です',
  path: ['rrule'],
};
const dueAfterStart = (v: TaskFieldsOutput) =>
  v.startsAt === null || v.dueAt === null || v.dueAt.getTime() >= v.startsAt.getTime();
const dueMessage = { message: '期限日時は開始日時以降にしてください', path: ['dueAt'] };

export const createTaskSchema = z
  .object(taskFields)
  .refine(requireBaseForRecurrence, recurrenceMessage)
  .refine(dueAfterStart, dueMessage);
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

const scopeFields = {
  scope: recurrenceScopeSchema.default('all'),
  /** scope が this / following のとき必須: 対象の発生の occurrenceKey */
  occurrenceKey: z.string().min(1).optional(),
};
const requireOccurrenceKey = (v: { scope: string; occurrenceKey?: string }) =>
  v.scope === 'all' || v.occurrenceKey !== undefined;
const occurrenceKeyMessage = {
  message: 'この回だけ／これ以降を指定するときは occurrenceKey が必要です',
  path: ['occurrenceKey'],
};

export const updateTaskSchema = z
  .object({ ...taskFields, ...scopeFields })
  .refine(requireBaseForRecurrence, recurrenceMessage)
  .refine(dueAfterStart, dueMessage)
  .refine(requireOccurrenceKey, occurrenceKeyMessage);
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const deleteTaskSchema = z
  .object(scopeFields)
  .refine(requireOccurrenceKey, occurrenceKeyMessage);
export type DeleteTaskInput = z.infer<typeof deleteTaskSchema>;

export const completeTaskSchema = z.object({
  occurrenceKey: z.string().min(1).default(SINGLE_OCCURRENCE_KEY),
});
