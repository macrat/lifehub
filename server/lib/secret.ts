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
 * 速いハッシュ（SHA-256）で塩も使わない（理由と前提は docs/architecture.md の「認証・認可」の秘密）。
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
