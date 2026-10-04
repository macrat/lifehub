import { describe, expect, it } from 'vitest';
import {
  chooseFrom,
  fromCandidates,
  partiesInOrder,
  partyFilterOptions,
  settlementExpense,
  toCandidates,
} from '../parties.ts';

const users = [{ id: 'a' }, { id: 'b' }];

describe('fromCandidates', () => {
  it('共有を先頭に、ユーザーを並べる', () => {
    expect(fromCandidates(users)).toEqual([null, 'a', 'b']);
  });
});

describe('partyFilterOptions', () => {
  it('共有を先頭に、共有は URL の値（shared）で並べる', () => {
    const label = (party: string | null) => party ?? '共有';
    expect(partyFilterOptions(users, label)).toEqual([
      { value: 'shared', label: '共有' },
      { value: 'a', label: 'a' },
      { value: 'b', label: 'b' },
    ]);
  });
});

describe('toCandidates', () => {
  it('From の相手を外す（From が共有なら共有を外す）', () => {
    expect(toCandidates(users, { toUserId: null, fromUserId: 'a' })).toEqual([null, 'b']);
    expect(toCandidates(users, { toUserId: 'a', fromUserId: null })).toEqual(['a', 'b']);
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

  it('To が共有のときに From に共有を選んだら、それまでの From を To に回す', () => {
    expect(chooseFrom({ toUserId: null, fromUserId: 'a' }, null)).toEqual({
      toUserId: 'a',
      fromUserId: null,
    });
  });
});

describe('partiesInOrder', () => {
  it('共有のための支払いなら払った人だけ、それ以外は To・From の順（共有からの引き出しは「To ← 共有」）', () => {
    expect(partiesInOrder({ toUserId: null, fromUserId: 'a' })).toEqual(['a']);
    expect(partiesInOrder({ toUserId: 'b', fromUserId: 'a' })).toEqual(['b', 'a']);
    expect(partiesInOrder({ toUserId: 'b', fromUserId: null })).toEqual(['b', null]);
  });
});

describe('settlementExpense', () => {
  it('債務者から債権者への支払いを、内容「精算」で入れる', () => {
    expect(settlementExpense({ creditorId: null, debtorId: 'a', amount: 1200 })).toEqual({
      fromUserId: 'a',
      toUserId: null,
      amount: 1200,
      description: '精算',
    });
  });
});
