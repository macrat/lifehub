import { beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../../../shared/id.ts';
import { clearTables, createTestUser } from '../../../lib/db/test-db.ts';
import { ForbiddenError, NotFoundError } from '../../../lib/errors.ts';
import {
  addMemo,
  deleteMemo,
  listPinnedMemos,
  setMemoPinned,
  timelineSource,
  updateMemo,
} from '../service.ts';

const everything = { from: new Date(0), to: new Date('2100-01-01T00:00:00Z') };

/** タイムラインに並ぶメモ */
async function listForTimeline(q: string | undefined) {
  const entries = await timelineSource.entries(everything, q, new Date());
  return entries.flatMap((entry) => (entry.type === 'memo' ? [entry.memo] : []));
}

describe('memos service', () => {
  let userId: string;
  beforeEach(async () => {
    await clearTables();
    userId = await createTestUser('A');
  });

  it('同じ id の作成を送り直しても二重に作らず、後から直した本文も巻き戻さない', async () => {
    const id = newId();
    await addMemo({ body: '最初' }, userId, id);
    await updateMemo(id, { body: '直した' }, userId);
    await addMemo({ body: '最初' }, userId, id);
    expect(await listForTimeline(undefined)).toMatchObject([
      { id, body: '直した', createdBy: userId },
    ]);
  });

  it('編集しても書いた時刻は動かず、消したものは消える', async () => {
    const id = newId();
    await addMemo({ body: '最初' }, userId, id);
    const [before] = await listForTimeline(undefined);
    await updateMemo(id, { body: '直した' }, userId);
    const [after] = await listForTimeline(undefined);
    expect(after?.createdAt).toBe(before?.createdAt);

    await deleteMemo(id, userId);
    expect(await listForTimeline(undefined)).toEqual([]);
    await expect(deleteMemo(id, userId)).rejects.toThrow(NotFoundError);
    await expect(updateMemo(id, { body: 'x' }, userId)).rejects.toThrow(NotFoundError);
  });

  it('ほかの人のメモは直すことも消すこともできない', async () => {
    const otherId = await createTestUser('B');
    const id = newId();
    await addMemo({ body: '最初' }, userId, id);
    await expect(updateMemo(id, { body: '横から' }, otherId)).rejects.toThrow(ForbiddenError);
    await expect(deleteMemo(id, otherId)).rejects.toThrow(ForbiddenError);
    expect(await listForTimeline(undefined)).toMatchObject([{ id, body: '最初' }]);
  });

  it('ピン止めしたメモを書いた時刻の新しい順に返し、外せば返さない。書いた時刻は動かない', async () => {
    const older = await addMemo({ body: '古い' }, userId);
    const newer = await addMemo({ body: '新しい' }, userId);
    await setMemoPinned(older.id, true, userId);
    await setMemoPinned(newer.id, true, userId);
    expect(await listPinnedMemos()).toMatchObject([
      { id: newer.id, pinned: true },
      { id: older.id, pinned: true, createdAt: older.createdAt },
    ]);

    await setMemoPinned(newer.id, false, userId);
    expect((await listPinnedMemos()).map((m) => m.id)).toEqual([older.id]);
  });

  it('ほかの人のメモはピン止めできない', async () => {
    const otherId = await createTestUser('B');
    const memo = await addMemo({ body: '最初' }, userId);
    await expect(setMemoPinned(memo.id, true, otherId)).rejects.toThrow(ForbiddenError);
    await expect(setMemoPinned(newId(), true, userId)).rejects.toThrow(NotFoundError);
    expect(await listPinnedMemos()).toEqual([]);
  });

  it('キーワードは本文の部分一致（大文字小文字を区別しない）', async () => {
    await addMemo({ body: 'Lemon の新芽' }, userId);
    await addMemo({ body: '買い物' }, userId);
    expect((await listForTimeline('lemon')).map((m) => m.body)).toEqual(['Lemon の新芽']);
  });
});
