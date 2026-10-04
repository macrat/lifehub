import { describe, expect, it } from 'vitest';
import { viewTransitionTypes } from '../view-transition.ts';

const at = (pathname: string, searchStr = '') => ({ pathname, searchStr });

describe('viewTransitionTypes', () => {
  it('画面が変わる移動（パスかカレンダーの表示が変わる）は繋ぐ', () => {
    expect(viewTransitionTypes({ fromLocation: at('/'), toLocation: at('/calendar') })).toEqual([]);
    expect(
      viewTransitionTypes({
        fromLocation: at('/calendar', '?view=month&date=2030-03-13'),
        toLocation: at('/calendar', '?view=week&date=2030-03-13'),
      }),
    ).toEqual([]);
  });

  it('同じ画面の中での更新（日付・絞り込み・キーワード）と、最初の表示は繋がない', () => {
    expect(
      viewTransitionTypes({
        fromLocation: at('/calendar', '?view=week&date=2030-03-13'),
        toLocation: at('/calendar', '?view=week&date=2030-03-20&q=歯医者'),
      }),
    ).toBe(false);
    expect(viewTransitionTypes({ toLocation: at('/') })).toBe(false);
  });
});
