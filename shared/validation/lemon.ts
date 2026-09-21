import { z } from 'zod';
import { newId } from '../id.ts';
import { instantSchema, uuidSchema } from './common.ts';

export const CARE_TYPES = ['water', 'mist', 'fertilize', 'bloom', 'harvest', 'note'] as const;
export type CareType = (typeof CARE_TYPES)[number];

export const CARE_TYPE_LABELS: Record<CareType, string> = {
  water: '水やり',
  mist: '葉水',
  fertilize: '施肥',
  bloom: '開花',
  harvest: '収穫',
  note: 'メモ',
};

/** ホームのカードや状態表示で経過日数を出す種別（メモは除く） */
export const TRACKED_CARE_TYPES = ['water', 'mist', 'fertilize', 'bloom', 'harvest'] as const;

/** 追加と編集で同じ形（編集は全項目を置き換える） */
export const careLogSchema = z
  .object({
    careType: z.enum(CARE_TYPES),
    doneAt: instantSchema,
    note: z.string().trim().max(2000).nullable().default(null),
  })
  .refine((v) => v.careType !== 'note' || (v.note !== null && v.note.length > 0), {
    message: 'メモの本文を入力してください',
    path: ['note'],
  });
export type CareLogInput = z.infer<typeof careLogSchema>;

/** API（POST /api/lemon/logs）が受け取る追加の入力。ID の決め方は createEventRequestSchema と同じ。 */
export const createCareLogRequestSchema = careLogSchema.safeExtend({
  id: uuidSchema.default(newId),
});
