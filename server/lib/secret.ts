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
 * 速いハッシュ（SHA-256）で塩も使わない（理由は docs/features/api-keys.md の「キー」）。
 * 元が `newSecret` の 256 ビットの乱数であることが前提で、人が決めた値や短い値には使えない。
 */
export function hashSecret(secret: string): SecretHash {
  return createHash('sha256').update(secret).digest('base64url') as SecretHash;
}

declare const secretHashBrand: unique symbol;

/**
 * `hashSecret` が作ったハッシュ。保存する列と、照合で引く引数をこの型にして、
 * 秘密そのものを取り違えて保存したり引いたりすると型で弾く。
 */
export type SecretHash = string & { readonly [secretHashBrand]: true };

/**
 * 発行の応答。秘密を見られるのはこの 1 回だけ。
 * 一覧の 1 行（`item`）と秘密を分けて返し、画面が一覧のキャッシュへ秘密を入れずに済むようにする。
 */
export type Issued<T> = { item: T; secret: string };
