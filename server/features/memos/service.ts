import { newId } from '../../../shared/id.ts';
import type { Memo } from '../../../shared/memos.ts';
import { memoEntry } from '../../../shared/timeline.ts';
import type { MemoInput } from '../../../shared/validation/memos.ts';
import { ForbiddenError, NotFoundError } from '../../lib/errors.ts';
import { recordTimelineSource } from '../../lib/timeline-source.ts';
import { publishChanged } from '../mcp-events/service.ts';
import * as repository from './repository.ts';
import type { MemoRow } from './schema.ts';

/**
 * メモを書いた所。画面から書いたメモは人だけ、MCP で書いたメモは人と MCP クライアントの名前を持つ。
 * MCP で書いたメモも書いた人（トークンのユーザー）のものなので、直す・消すはその人ができる
 */
export type MemoAuthor = { userId: string; mcpClientName?: string };

/** id はクライアントが決めて送ってくる（`createMemoRequestSchema`）。省略された呼び出し（MCP）はここで採番する */
export async function addMemo(
  input: MemoInput,
  { userId, mcpClientName }: MemoAuthor,
  id: string = newId(),
): Promise<Memo> {
  const memo = toMemo(
    await repository.insert({
      ...input,
      id,
      createdBy: userId,
      mcpClientName: mcpClientName ?? null,
    }),
  );
  publishChanged({ type: 'memo', record: memo }, 'added', { userId });
  return memo;
}

/** 本文を置き換える。書いた人・書いた MCP クライアント・書いた時刻は変えない（タイムラインの位置は動かない） */
export async function updateMemo(id: string, input: MemoInput, actorId: string): Promise<Memo> {
  const updated = await repository.update(id, actorId, input.body);
  if (!updated) return rejectWrite(id);
  const memo = toMemo(updated);
  publishChanged({ type: 'memo', record: memo }, 'updated', { userId: actorId });
  return memo;
}

export async function deleteMemo(id: string, actorId: string): Promise<void> {
  const deleted = await repository.remove(id, actorId);
  if (!deleted) return rejectWrite(id);
  publishChanged({ type: 'memo', record: toMemo(deleted) }, 'deleted', { userId: actorId });
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
    mcpClientName: row.mcpClientName,
    createdAt: row.createdAt.toISOString(),
  };
}
