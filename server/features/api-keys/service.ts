import { newId } from '../../../shared/id.ts';
import type { ApiKeyInput } from '../../../shared/validation/api-keys.ts';
import { NotFoundError } from '../../lib/errors.ts';
import * as repository from './repository.ts';
import type { ApiKeyRow } from './schema.ts';

/** 画面に出す API キー。キーそのものは持たない（保存していないので出せない） */
export type ApiKey = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
};

/** 発行した直後だけ返す形。キーを見られるのはこの 1 回だけ */
export type IssuedApiKey = ApiKey & { key: string };

export async function listKeys(userId: string): Promise<ApiKey[]> {
  return (await repository.findByUser(userId)).map(toApiKey);
}

export async function createKey(input: ApiKeyInput, userId: string): Promise<IssuedApiKey> {
  const key = newKey();
  const values = { id: newId(), userId, name: input.name, createdAt: new Date() };
  await repository.insert({ ...values, keyHash: await hashOf(key) });
  // 保存した値はすべて手元にあるので読み直さない（往復を 1 回減らす）
  return { ...toApiKey({ ...values, lastUsedAt: null }), key };
}

/** 失効。他のユーザーのキーは消せない（見えてもいない） */
export async function revokeKey(id: string, userId: string): Promise<void> {
  if (!(await repository.remove(id, userId))) {
    throw new NotFoundError('API キーが見つかりません');
  }
}

/**
 * キーを照合し、持ち主のユーザー ID を返す（無効なら undefined）。使われた日時もここで記録する。
 * 照合はハッシュの一致を DB に引かせる。ハッシュ同士の比較なので、比較にかかる時間からキーは漏れない。
 */
export async function authenticate(
  key: string,
  now: Date = new Date(),
): Promise<string | undefined> {
  return (await repository.touchByHash(await hashOf(key), now))?.userId;
}

/** 推測できないことだけが防御なので、256 ビットの乱数を base64url で表す（配信 URL のトークンと同じ） */
function newKey(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
}

async function hashOf(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Buffer.from(digest).toString('base64url');
}

function toApiKey(row: Pick<ApiKeyRow, 'id' | 'name' | 'createdAt' | 'lastUsedAt'>): ApiKey {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}
