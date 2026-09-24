import { randomBytes } from 'node:crypto';

/**
 * URL やヘッダーに載せる秘密（配信 URL のトークン、API キー）。
 * 推測できないことだけが防御なので、256 ビットの乱数を base64url（43 文字）で表す。
 */
export function newSecret(): string {
  return randomBytes(32).toString('base64url');
}
