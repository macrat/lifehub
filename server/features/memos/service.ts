import { newId } from '../../../shared/id.ts';
import type { Memo } from '../../../shared/memos.ts';
import { memoEntry } from '../../../shared/timeline.ts';
import type { MemoInput } from '../../../shared/validation/memos.ts';
import { ForbiddenError, NotFoundError } from '../../lib/errors.ts';
import { recordTimelineSource } from '../../lib/timeline-source.ts';
import { publishSaved } from '../mcp-events/service.ts';
import * as repository from './repository.ts';
import type { MemoRow } from './schema.ts';

/** id はクライアントが決めて送ってくる（`createMemoRequestSchema`）。省略された呼び出し（MCP）はここで採番する */
export async function addMemo(
  input: MemoInput,
  userId: string,
  id: string = newId(),
): Promise<Memo> {
  const memo = toMemo(await repository.insert({ ...input, id, createdBy: userId }));
  publishSaved({ type: 'memo', record: memo }, 'added', { userId });
  return memo;
}

/** 本文を置き換える。書いた人と書いた時刻は変えない（タイムラインの位置は動かない） */
export async function updateMemo(id: string, input: MemoInput, actorId: string): Promise<Memo> {
  const updated = await repository.update(id, actorId, input.body);
  if (!updated) return rejectWrite(id);
  const memo = toMemo(updated);
  publishSaved({ type: 'memo', record: memo }, 'updated', { userId: actorId });
  return memo;
}

export async function deleteMemo(id: string, actorId: string): Promise<void> {
  if (!(await repository.remove(id, actorId))) await rejectWrite(id);
}

/**
 * 書き込めなかった理由を返す。メモは書いた人の言葉なので、直す・消すは書いた本人だけができる
 * （repository の update/remove が書いた人で絞る。予定・タスク・立替・レモンの記録は家族で管理する
 * 共有の記録なので誰でも直せる）。
 * WHY NOT ほかの人のメモも見つからないことにする（404）: タイムラインで読めるので、在ることは隠せない。
 */
async function rejectWrite(id: string): Promise<never> {
  if (await repository.exists(id)) throw new ForbiddenError('ほかの人のメモは変更できません');
  throw new NotFoundError('メモが見つかりません');
}

/** タイムラインに並べるメモ（置く日時は書いた時刻。キーワードは本文の部分一致） */
export const timelineSource = recordTimelineSource(repository.timeline, (row) =>
  memoEntry(toMemo(row)),
);

function toMemo(row: MemoRow): Memo {
  return {
    id: row.id,
    body: row.body,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}
