import { newId } from '../../../shared/id.ts';
import type { Memo } from '../../../shared/memos.ts';
import type { MemoInput } from '../../../shared/validation/memos.ts';
import { NotFoundError } from '../../lib/errors.ts';
import type { InstantRange } from '../../lib/history.ts';
import * as repository from './repository.ts';
import type { MemoRow } from './schema.ts';

/** id はクライアントが決めて送ってくる（`createMemoRequestSchema`） */
export async function addMemo(
  input: MemoInput,
  userId: string,
  id: string = newId(),
): Promise<void> {
  await repository.insert({ ...input, id, createdBy: userId });
}

/** 本文を置き換える。書いた人と書いた時刻は変えない（タイムラインの位置は動かない） */
export async function updateMemo(id: string, input: MemoInput): Promise<void> {
  if (!(await repository.update(id, input.body))) throw new NotFoundError('メモが見つかりません');
}

export async function deleteMemo(id: string): Promise<void> {
  if (!(await repository.remove(id))) throw new NotFoundError('メモが見つかりません');
}

/** タイムラインのページ分け: before より前の、新しいほうから limit 件の日時 */
export function recentTimelineInstants(
  before: Date,
  q: string | undefined,
  limit: number,
): Promise<Date[]> {
  return repository.findRecentInstants(before, q, limit);
}

/** タイムラインに並べるメモ（書いた時刻が範囲の中のもの） */
export async function listForTimeline(range: InstantRange, q: string | undefined): Promise<Memo[]> {
  return (await repository.findInRange(range, q)).map(toMemo);
}

function toMemo(row: MemoRow): Memo {
  return {
    id: row.id,
    body: row.body,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}
