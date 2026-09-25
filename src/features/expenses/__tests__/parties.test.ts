import { describe, expect, it } from 'vitest';
import { chooseFrom, toCandidates } from '../parties.ts';

describe('toCandidates', () => {
  it('From の人を外す', () => {
    const users = [{ id: 'a' }, { id: 'b' }];
    expect(toCandidates(users, { toUserId: null, fromUserId: 'a' })).toEqual([{ id: 'b' }]);
  });
});

describe('chooseFrom', () => {
  it('To と違う人なら From だけを変える', () => {
    expect(chooseFrom({ toUserId: null, fromUserId: 'a' }, 'b')).toEqual({
      toUserId: null,
      fromUserId: 'b',
    });
    expect(chooseFrom({ toUserId: 'c', fromUserId: 'a' }, 'b')).toEqual({
      toUserId: 'c',
      fromUserId: 'b',
    });
  });

  it('To にいる人を選んだら To と From を入れ替える', () => {
    expect(chooseFrom({ toUserId: 'b', fromUserId: 'a' }, 'b')).toEqual({
      toUserId: 'a',
      fromUserId: 'b',
    });
  });
});
