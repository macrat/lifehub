/**
 * service 層が投げる業務エラー。routes.ts の共通ハンドラ（server/app.ts）が HTTP ステータスに変換する。
 * service は HTTP を知らず、routes は業務ルールを知らないようにするための境界。
 */
export class NotFoundError extends Error {}

export class ConflictError extends Error {}

export class ValidationError extends Error {}
