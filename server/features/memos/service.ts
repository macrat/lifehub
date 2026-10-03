import { newId } from '../../../shared/id.ts';
import { type Memo, sortPinnedMemos } from '../../../shared/memos.ts';
import { memoEntry, type TimelineEntry } from '../../../shared/timeline.ts';
import type { MemoInput } from '../../../shared/validation/memos.ts';
import { ForbiddenError, NotFoundError } from '../../lib/errors.ts';
import { recordTimelineSource } from '../../lib/timeline-source.ts';
import * as repository from './repository.ts';
import type { MemoRow } from './schema.ts';

/** id はクライアントが決めて送ってくる（`createMemoRequestSchema`）。省略された呼び出し（MCP）はここで採番する */
export async function addMemo(
  input: MemoInput,
  userId: string,
  id: string = newId(),
): Promise<Memo> {
  return toMemo(await repository.insert({ ...input, id, createdBy: userId }));
}

/** 本文を置き換える。書いた人と書いた時刻は変えない（タイムラインの位置は動かない） */
export async function updateMemo(id: string, input: MemoInput, actorId: string): Promise<Memo> {
  const updated = await repository.update(id, actorId, input.body);
  return updated ? toMemo(updated) : rejectWrite(id);
}

/**
 * ピン止めする（pinned = true）か外す。誰が書いたメモでもできる。
 * WHY 本人に限らない: ピン止めはメモの言葉を変えず、家族で見るホームの並べ方を変えるだけなので、
 * 直す・消す（書いた人の言葉を変える）とは違って共有の記録と同じに扱う。
 */
export async function setMemoPinned(id: string, pinned: boolean): Promise<void> {
  if (!(await repository.setPinned(id, pinned))) throw new NotFoundError('メモが見つかりません');
}

/** ピン止めしたメモ（書いた時刻の新しい順）。ホームのタイムラインの一番上に固定して出す */
export async function listPinnedMemos(): Promise<Memo[]> {
  return sortPinnedMemos((await repository.findPinned()).map(toMemo));
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
export const timelineSource = recordTimelineSource(repository.timeline, toEntry);

/**
 * 絞り込んでいないホームのタイムラインに並べるメモ。ピン止めしたものは画面がタイムラインの上に固定して出すので
 * 除く（`listPinnedMemos`）。絞り込んでいるときと MCP の日ごとの読み出しは `timelineSource`（ピン止めも含む）を読む。
 */
export const unpinnedTimelineSource = recordTimelineSource(repository.unpinnedTimeline, toEntry);

function toEntry(row: MemoRow): TimelineEntry {
  return memoEntry(toMemo(row));
}

function toMemo(row: MemoRow): Memo {
  return {
    id: row.id,
    body: row.body,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    pinned: row.pinned,
  };
}
