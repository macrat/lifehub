/**
 * service 層が投げる業務エラー。画面の API（`lib/trpc.ts`）と Hono の共通ハンドラ（`server/app.ts`）が、
 * 下の `DOMAIN_ERRORS` で失敗の種類に置き換える。
 * service は HTTP を知らず、routes は業務ルールを知らないようにするための境界。
 */
export class NotFoundError extends Error {}

/** 権限の無い操作（例: 他のユーザーのパスワードの変更） */
export class ForbiddenError extends Error {}

export class ConflictError extends Error {}

export class ValidationError extends Error {}

/** 業務エラーと、それを伝える失敗の種類（tRPC のコード・HTTP ステータス）の対応。置き換える所はすべてここを引く */
const DOMAIN_ERRORS = [
  { type: NotFoundError, code: 'NOT_FOUND', status: 404 },
  { type: ForbiddenError, code: 'FORBIDDEN', status: 403 },
  { type: ConflictError, code: 'CONFLICT', status: 409 },
  { type: ValidationError, code: 'BAD_REQUEST', status: 400 },
] as const;

/** error が業務エラーなら、その失敗の種類。想定外の失敗なら undefined */
export function domainErrorOf(error: unknown) {
  return DOMAIN_ERRORS.find(({ type }) => error instanceof type);
}
