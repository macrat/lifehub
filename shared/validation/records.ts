import { z } from 'zod';
import { clientIdShape, instantSchema } from './common.ts';
import { careLogFieldsSchema, withCareLogRules } from './lemon.ts';

/**
 * 記録投入用エンドポイント（POST /api/records。[docs/features/api-keys.md](../../docs/features/api-keys.md)）の入力。
 * `type` で何の記録かを選び、残りはその記録の項目。記録の種類を増やすときは、この union に 1 つ足す。
 *
 * - `id` は省略できる。送った側が決めておけば、届いたか分からずに送り直しても二重に作られない
 *   （各 feature の作成は同じ id の作成が既にあれば何も書かない）。
 * - 日時は省略すると受け取った時刻になる。時計を持たない（持っても合わせる手間をかけたくない）
 *   デバイスは、今起きたことを送るだけで済む。
 */
export const recordSchema = z.discriminatedUnion('type', [
  withCareLogRules(
    careLogFieldsSchema.extend({
      type: z.literal('lemon'),
      ...clientIdShape,
      doneAt: instantSchema.default(() => new Date()),
    }),
  ),
]);
export type RecordInput = z.infer<typeof recordSchema>;
