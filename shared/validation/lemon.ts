import { z } from 'zod';
import { newId } from '../id.ts';
import { dateStringSchema, instantSchema, uuidSchema } from './common.ts';

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

/**
 * 記録の絞り込み。範囲は両端を含み、省略した端は制限しない（開始日だけ・終了日だけでも絞り込める）。
 * レモン画面の URL（`lemonSearchSchema`）と API（`careLogListQuerySchema`）が同じ規則を使う。
 */
export const careLogFilterSchema = z.object({
  /** メモのキーワード（大文字小文字を区別しない部分一致） */
  q: z.string().optional(),
  /** 世話の項目。その項目を含む記録だけが残る（1 件が複数の項目を持つため） */
  kind: z.enum(CARE_TYPES).optional(),
  /** 実施日（JST の暦日）の最初・最後 */
  since: dateStringSchema.optional(),
  until: dateStringSchema.optional(),
});
export type CareLogFilter = z.infer<typeof careLogFilterSchema>;

/**
 * 記録の 1 ページの取得（GET /api/lemon/logs）。before を省くと最新のページ、
 * 渡すとその日より前のページ（前のページの `nextCursor` をそのまま渡す）。
 */
export const careLogListQuerySchema = careLogFilterSchema.extend({
  before: dateStringSchema.optional(),
});
export type CareLogListQuery = z.infer<typeof careLogListQuerySchema>;
