import { z } from 'zod';
import { newId } from '../id.ts';
import { instantSchema, uuidSchema } from './common.ts';

/**
 * 世話の項目。並びは記録フォームのチェックボックスの並び（上段: 葉水・水やり・施肥、下段: 開花・落果・収穫）で、
 * 状況のタイルも記録の一覧もこの順に出す。世話そのもの（前の 3 つ）と木の様子（後の 3 つ）で段が分かれる。
 */
export const CARE_TYPES = ['mist', 'water', 'fertilize', 'bloom', 'drop', 'harvest'] as const;
export type CareType = (typeof CARE_TYPES)[number];

export const CARE_TYPE_LABELS: Record<CareType, string> = {
  mist: '葉水',
  water: '水やり',
  fertilize: '施肥',
  bloom: '開花',
  drop: '落果',
  harvest: '収穫',
};

/**
 * 並びを CARE_TYPES の順に揃え、重複を落とす。
 * 入力の順でぶれると、同じ組み合わせでも見た目が揃わない（一覧の枠・詳細の見出し）。
 */
export function normalizeCareTypes(careTypes: readonly CareType[]): CareType[] {
  return CARE_TYPES.filter((t) => careTypes.includes(t));
}

/** 追加と編集で同じ形（編集は全項目を置き換える） */
export const careLogSchema = z
  .object({
    /**
     * 1 回の記録に結び付ける項目。葉水と水やりは大抵まとめてやり、その途中で開花や落果に気づくので、
     * 1 回の世話を種別ごとの記録に割らずに 1 件へまとめる。
     */
    careTypes: z.array(z.enum(CARE_TYPES)).transform(normalizeCareTypes),
    doneAt: instantSchema,
    note: z.string().trim().max(2000).nullable().default(null),
  })
  .refine((v) => v.careTypes.length > 0 || (v.note !== null && v.note.length > 0), {
    // 項目を 1 つも選ばない記録はメモそのもの。本文まで空だと何も残らない
    message: '項目を選ぶか、メモを入力してください',
    path: ['note'],
  });
export type CareLogInput = z.infer<typeof careLogSchema>;

/** API（POST /api/lemon/logs）が受け取る追加の入力。ID の決め方は createEventRequestSchema と同じ。 */
export const createCareLogRequestSchema = careLogSchema.safeExtend({
  id: uuidSchema.default(newId),
});
