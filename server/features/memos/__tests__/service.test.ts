import { beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../../../shared/id.ts';
import { NotFoundError } from '../../../lib/errors.ts';
import { createTestUser, truncateAll } from '../../../lib/test-db.ts';
import { addMemo, deleteMemo, listForTimeline, updateMemo } from '../service.ts';

const everything = { from: new Date(0), to: new Date('2100-01-01T00:00:00Z') };

describe('memos service', () => {
  let userId: string;
  beforeEach(async () => {
    await truncateAll();
    userId = await createTestUser('A');
  });

  it('同じ id の作成を送り直しても二重に作らず、後から直した本文も巻き戻さない', async () => {
    const id = newId();
    await addMemo({ body: '最初' }, userId, id);
    await updateMemo(id, { body: '直した' });
    await addMemo({ body: '最初' }, userId, id);
    expect(await listForTimeline(everything, undefined)).toMatchObject([
      { id, body: '直した', createdBy: userId },
    ]);
  });

  it('編集しても書いた時刻は動かず、消したものは消える', async () => {
    const id = newId();
    await addMemo({ body: '最初' }, userId, id);
    const [before] = await listForTimeline(everything, undefined);
    await updateMemo(id, { body: '直した' });
    const [after] = await listForTimeline(everything, undefined);
    expect(after?.createdAt).toBe(before?.createdAt);

    await deleteMemo(id);
    expect(await listForTimeline(everything, undefined)).toEqual([]);
    await expect(deleteMemo(id)).rejects.toThrow(NotFoundError);
    await expect(updateMemo(id, { body: 'x' })).rejects.toThrow(NotFoundError);
  });

  it('キーワードは本文の部分一致（大文字小文字を区別しない）', async () => {
    await addMemo({ body: 'Lemon の新芽' }, userId);
    await addMemo({ body: '買い物' }, userId);
    expect((await listForTimeline(everything, 'lemon')).map((m) => m.body)).toEqual([
      'Lemon の新芽',
    ]);
  });
});
