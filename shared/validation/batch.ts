import { z } from 'zod';

/** 束ねた GET（`/api/batch?r=…`）が 1 回で運ぶ要求の数の上限 */
export const MAX_BATCH_REQUESTS = 20;

/**
 * 束ねた GET の問い合わせ: 運ぶ要求（`/api/` 配下のパスとクエリ）を r に並べる。
 * 1 つだけのときはクエリの値が配列にならないので、配列にそろえる。
 */
export const batchQuerySchema = z.object({
  r: z
    .union([z.string().transform((path) => [path]), z.array(z.string())])
    .pipe(z.array(z.string()).min(1).max(MAX_BATCH_REQUESTS)),
});
