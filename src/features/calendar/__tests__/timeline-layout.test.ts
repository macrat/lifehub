import { describe, expect, it } from 'vitest';
import { layoutTimed } from '../components/timeline-layout.ts';

const block = (key: string, startMin: number, endMin: number) => ({
  key,
  item: key,
  startMin,
  endMin,
});

describe('layoutTimed', () => {
  it('重ならなければ全項目が 1 列', () => {
    const placed = layoutTimed([block('a', 540, 600), block('b', 600, 660)]);
    expect(placed.map((p) => [p.key, p.col, p.cols])).toEqual([
      ['a', 0, 1],
      ['b', 0, 1],
    ]);
  });

  it('重なる項目は同じクラスタで列を分け、幅を等分する', () => {
    const placed = layoutTimed([block('a', 540, 660), block('b', 570, 630), block('c', 720, 780)]);
    const byKey = Object.fromEntries(placed.map((p) => [p.key, p]));
    expect(byKey.a).toMatchObject({ col: 0, cols: 2 });
    expect(byKey.b).toMatchObject({ col: 1, cols: 2 });
    expect(byKey.c).toMatchObject({ col: 0, cols: 1 });
  });

  it('列が空けば再利用する', () => {
    const placed = layoutTimed([block('a', 540, 600), block('b', 560, 700), block('c', 610, 650)]);
    const byKey = Object.fromEntries(placed.map((p) => [p.key, p]));
    expect(byKey.c).toMatchObject({ col: 0, cols: 2 });
  });

  it('短い項目でも最小の長さで重なりを判定し、返す endMin は元のまま', () => {
    const placed = layoutTimed([block('a', 540, 545), block('b', 550, 560)]);
    expect(placed.every((p) => p.cols === 2)).toBe(true);
    expect(placed.find((p) => p.key === 'a')?.endMin).toBe(545);
  });
});
