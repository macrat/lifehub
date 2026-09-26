import { zValidator } from '@hono/zod-validator';
import type { Context, ValidationTargets } from 'hono';
import type { ZodType } from 'zod';

/**
 * 検証失敗の応答を app.onError の ValidationError と同じ `{ message }` の 400 にそろえるフック
 * （zValidator の既定は Zod の結果をそのまま返し、クライアントの ensureOk が読む message が無い）。
 * 引数と戻り値の型を具体的に書くのは、Hono RPC がこの 400 だけを失敗の応答として型に載せるため
 * （zod-validator の Hook 型をそのまま使うと status が全部の値になり、200 の型が引けなくなる）。
 */
function validationHook(
  result: { success: boolean; error?: { issues: { message: string }[] } },
  c: Context,
) {
  if (result.success) return;
  return c.json({ message: result.error?.issues[0]?.message ?? '入力が正しくありません' }, 400);
}

/**
 * 入力（target）を schema で検証するミドルウェア。すべてのルートがこれを使い、失敗の応答を 1 つの形にそろえる
 */
export function validate<Target extends keyof ValidationTargets, Schema extends ZodType>(
  target: Target,
  schema: Schema,
) {
  return zValidator(target, schema, validationHook);
}
