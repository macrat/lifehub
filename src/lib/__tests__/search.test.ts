import { describe, expect, it } from 'vitest';
import { matchesKeyword } from '../search.ts';

describe('matchesKeyword', () => {
  it('空のキーワードはすべてに一致する', () => {
    expect(matchesKeyword('', 'スーパー')).toBe(true);
    expect(matchesKeyword('   ', null)).toBe(true);
  });

  it('部分一致で、大文字小文字は区別しない', () => {
    expect(matchesKeyword('スーパー', 'スーパーで買い物')).toBe(true);
    expect(matchesKeyword('amazon', 'Amazon で注文')).toBe(true);
    expect(matchesKeyword('コンビニ', 'スーパーで買い物')).toBe(false);
  });

  it('前後の空白は無視する', () => {
    expect(matchesKeyword('  肥料 ', '肥料をやった')).toBe(true);
  });

  it('どれか 1 つに一致すればよく、空の欄は一致しない', () => {
    expect(matchesKeyword('駅前', 'ランチ', '駅前のカフェ', null)).toBe(true);
    expect(matchesKeyword('駅前', 'ランチ', null, undefined)).toBe(false);
  });
});
