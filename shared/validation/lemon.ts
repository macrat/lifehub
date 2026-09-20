import { z } from 'zod';
import { instantSchema } from './common.ts';

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

export const createCareLogSchema = z
  .object({
    careType: z.enum(CARE_TYPES),
    doneAt: instantSchema,
    note: z.string().trim().max(2000).nullable().default(null),
  })
  .refine((v) => v.careType !== 'note' || (v.note !== null && v.note.length > 0), {
    message: 'メモの本文を入力してください',
    path: ['note'],
  });
export type CreateCareLogInput = z.infer<typeof createCareLogSchema>;
