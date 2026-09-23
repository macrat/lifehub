/**
 * service 層が投げる業務エラー。routes.ts の共通ハンドラ（server/app.ts）が HTTP ステータスに変換する。
 * service は HTTP を知らず、routes は業務ルールを知らないようにするための境界。
 */
export class NotFoundError extends Error {}

/** 権限の無い操作（例: 他のユーザーのパスワードの変更） */
export class ForbiddenError extends Error {}

export class ConflictError extends Error {}

export class ValidationError extends Error {}
