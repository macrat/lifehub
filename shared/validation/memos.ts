import { z } from 'zod';
import { newId } from '../id.ts';
import { uuidSchema } from './common.ts';

/** メモの本文の上限（文字数）。一言を書き留めるもので、長文を書く場所ではない */
export const MEMO_MAX_LENGTH = 500;

/** メモの入力。追加と編集で同じ（編集は本文を置き換える）。プレーンテキストで、書式は持たない */
export const memoSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'メモを入力してください')
    .max(MEMO_MAX_LENGTH, `メモは ${MEMO_MAX_LENGTH} 文字までです`),
});
export type MemoInput = z.infer<typeof memoSchema>;

/** API（POST /api/memos）が受け取る追加の入力。ID の決め方は createEventRequestSchema と同じ。 */
export const createMemoRequestSchema = memoSchema.safeExtend({
  id: uuidSchema.default(newId),
});
