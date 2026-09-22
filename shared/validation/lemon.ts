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

/** 記録に結び付いた項目の名前。1 つも無ければ空文字（その記録はメモそのもの） */
export function careTypesLabel(careTypes: CareType[]): string {
  return careTypes.map((t) => CARE_TYPE_LABELS[t]).join('・');
}

/** 追加と編集で同じ形（編集は全項目を置き換える） */
export const careLogSchema = z
  .object({
    /**
     * 1 回の記録に結び付ける項目。葉水と水やりは大抵まとめてやり、その途中で開花や落果に気づくので、
     * 1 回の世話を種別ごとの記録に割らずに 1 件へまとめる。
     * 並びは CARE_TYPES に正規化して重複を落とす（入力の順でぶれると一覧の見た目が揃わない）。
     */
    careTypes: z
      .array(z.enum(CARE_TYPES))
      .transform((types) => CARE_TYPES.filter((t) => types.includes(t))),
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
