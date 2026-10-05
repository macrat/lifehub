import { describe, expect, it } from 'vitest';
import {
  ALL,
  dateOrUndefined,
  numberOrUndefined,
  optionOrUndefined,
  toListFilter,
} from '../search.ts';

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

  it('number 入力の空欄と数字にならない入力は絞り込まない', () => {
    expect(numberOrUndefined('')).toBeUndefined();
    expect(numberOrUndefined('e')).toBeUndefined();
    expect(numberOrUndefined('0')).toBe(0);
    expect(numberOrUndefined('1500')).toBe(1500);
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
