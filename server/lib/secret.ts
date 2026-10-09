import { createHash, randomBytes } from 'node:crypto';

/**
 * URL やヘッダーに載せる秘密（配信 URL のトークン、API キー）。
 * 推測できないことだけが防御なので、256 ビットの乱数を base64url（43 文字）で表す。
 */
export function newSecret(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * `newSecret` で作った秘密を保存するときのハッシュ（API キー、配信 URL のトークン）。
 * DB には秘密そのものを置かず、受け取った秘密をこれで引き当てる。
 *
 * 速いハッシュ（SHA-256）で塩も使わない。元が 256 ビットの乱数なので、総当たりもレインボーテーブルも
 * 成り立たず、遅いハッシュや塩で守れるものが無い。遅いハッシュは塩を伴うので、受け取った秘密から
 * ハッシュを作って DB を引くことができなくなり、配信のたびに重い計算も走る。
 * 人が決めた値や短い値を秘密にするなら、この前提は崩れる。
 */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('base64url');
}
