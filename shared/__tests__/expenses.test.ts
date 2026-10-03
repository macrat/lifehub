import { describe, expect, it } from 'vitest';
import { type ExpenseTotal, settlementsOf } from '../expenses.ts';

const total = (fromUserId: string | null, toUserId: string | null, amount: number) =>
  ({ fromUserId, toUserId, amount }) satisfies ExpenseTotal;

describe('settlementsOf', () => {
  it('貸し借りが無ければ移動なし', () => {
    expect(settlementsOf([])).toEqual([]);
    expect(settlementsOf([total('a', 'b', 500), total('b', 'a', 500)])).toEqual([]);
  });

  it('払った側が債権者、払ってもらった側が債務者になる', () => {
    expect(settlementsOf([total('a', null, 1000)])).toEqual([
      { creditorId: 'a', debtorId: null, amount: 1000 },
    ]);
    expect(settlementsOf([total(null, 'b', 300)])).toEqual([
      { creditorId: null, debtorId: 'b', amount: 300 },
    ]);
  });

  it('循環する貸し借りは打ち消す', () => {
    // a → b → 共有 → a と 1000 ずつ回っているだけ
    expect(
      settlementsOf([total('a', 'b', 1000), total('b', null, 1000), total(null, 'a', 1000)]),
    ).toEqual([]);
  });

  it('3 者とも正味が 0 でなければ、移動は 2 つにまとめ、額の大きい順に並べる', () => {
    // 正味: a +3000、b −1000、共有 −2000
    expect(
      settlementsOf([total('a', null, 2500), total('a', 'b', 500), total(null, 'b', 500)]),
    ).toEqual([
      { creditorId: 'a', debtorId: null, amount: 2000 },
      { creditorId: 'a', debtorId: 'b', amount: 1000 },
    ]);
  });

  it('中継するだけの当事者を挟まず、債権者と債務者を直接つなぐ', () => {
    // 共有が a に借り、b が共有に借りている。正味は共有が 0 なので b から a へ 1 回で済む
    expect(settlementsOf([total('a', null, 800), total(null, 'b', 800)])).toEqual([
      { creditorId: 'a', debtorId: 'b', amount: 800 },
    ]);
  });
});
