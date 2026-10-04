import { zValidator } from '@hono/zod-validator';
import type { Context, ValidationTargets } from 'hono';
import type { ZodType } from 'zod';
import { issueMessage } from './errors.ts';

/**
 * 検証失敗の応答を app.onError の ValidationError と同じ `{ message }` の 400 にそろえるフック
 * （zValidator の既定は Zod の結果をそのまま返し、呼び出し元（記録投入のデバイスなど）が読む message が無い）。
 * Hono のまま残る口（記録投入・QStash など）が使う。画面の API の検証は tRPC の `.input`（`lib/trpc.ts`）。
 */
function validationHook(
  result: { success: boolean; error?: { issues: { message: string }[] } },
  c: Context,
) {
  if (result.success) return;
  return c.json({ message: issueMessage(result.error?.issues) }, 400);
}

/**
 * 入力（target）を schema で検証するミドルウェア。すべてのルートがこれを使い、失敗の応答を 1 つの形にそろえる。
 * zValidator が返す関数は無名なので、トレースのミドルウェアのスパン（名前は関数名）で何を検証しているかが
 * 分かるよう `validate(json)` のような名前を付ける。
 */
export function validate<Target extends keyof ValidationTargets, Schema extends ZodType>(
  target: Target,
  schema: Schema,
) {
  return Object.defineProperty(zValidator(target, schema, validationHook), 'name', {
    value: `validate(${target})`,
  });
}
