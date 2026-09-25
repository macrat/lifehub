import { newId } from '../../../shared/id.ts';
import type { Memo } from '../../../shared/memos.ts';
import type { MemoInput } from '../../../shared/validation/memos.ts';
import { ForbiddenError, NotFoundError } from '../../lib/errors.ts';
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

/**
 * 本文を置き換える。書いた人と書いた時刻は変えない（タイムラインの位置は動かない）。
 * 直せるのは書いた本人だけ（`assertOwnMemo`）。
 */
export async function updateMemo(id: string, input: MemoInput, actorId: string): Promise<void> {
  await assertOwnMemo(id, actorId);
  if (!(await repository.update(id, input.body))) throw new NotFoundError('メモが見つかりません');
}

/** 消せるのも書いた本人だけ（`assertOwnMemo`） */
export async function deleteMemo(id: string, actorId: string): Promise<void> {
  await assertOwnMemo(id, actorId);
  if (!(await repository.remove(id))) throw new NotFoundError('メモが見つかりません');
}

/**
 * メモは書いた人の言葉なので、ほかの人が書き換えたり消したりできないようにする
 * （予定・タスク・立替・レモンの記録は家族で管理する共有の記録なので誰でも直せる）。
 * WHY NOT 見つからないことにする（404）: ほかの人のメモもタイムラインで読めるので、在ることは隠せない。
 */
async function assertOwnMemo(id: string, actorId: string): Promise<void> {
  const createdBy = await repository.findCreator(id);
  if (createdBy === undefined) throw new NotFoundError('メモが見つかりません');
  if (createdBy !== actorId) throw new ForbiddenError('ほかの人のメモは変更できません');
}

/** タイムラインのページ分け: before より前の、新しいほうから limit 件の日時 */
export function recentTimelineInstants(
  before: Date,
  q: string | undefined,
  limit: number,
): Promise<Date[]> {
  return repository.findRecentTimelineInstants(before, q, limit);
}

/** タイムラインに並べるメモ（書いた時刻が範囲の中のもの） */
export async function listForTimeline(range: InstantRange, q: string | undefined): Promise<Memo[]> {
  return (await repository.findInTimelineRange(range, q)).map(toMemo);
}

function toMemo(row: MemoRow): Memo {
  return {
    id: row.id,
    body: row.body,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}
