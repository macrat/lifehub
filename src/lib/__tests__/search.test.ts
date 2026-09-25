import { describe, expect, it } from 'vitest';
import { matchesKeyword } from '../../../shared/search.ts';
import { ALL, dateOrUndefined, optionOrUndefined, toListFilter } from '../search.ts';

describe('絞り込みの入力値', () => {
  it('選択欄の「すべて」は絞り込まない', () => {
    expect(optionOrUndefined(ALL)).toBeUndefined();
    expect(optionOrUndefined('mist')).toBe('mist');
  });

  it('date 入力の空欄と打ちかけは絞り込まない', () => {
    expect(dateOrUndefined('')).toBeUndefined();
    expect(dateOrUndefined('2026-09')).toBeUndefined();
    expect(dateOrUndefined('2026-09-23')).toBe('2026-09-23');
  });
});

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

describe('toListFilter', () => {
  it('空のキーワードは絞り込まないのと同じキーになる', () => {
    expect(toListFilter({ q: '  ', min: undefined })).toEqual(toListFilter({ q: '' }));
    expect(toListFilter({ q: ' スーパー ' }).q).toBe('スーパー');
  });

  it('入力を開くしるしはサーバーに渡さない', () => {
    expect(toListFilter({ q: '', add: 'expense', min: 500 })).toEqual({ min: 500 });
  });
});
