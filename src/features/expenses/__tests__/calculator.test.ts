import { describe, expect, it } from 'vitest';
import {
  type CalculatorKey,
  evaluate,
  formatExpression,
  normalizeExpression,
  pressKey,
} from '../calculator.ts';

/** キーを順に押した後の式 */
const press = (...keys: CalculatorKey[]) => keys.reduce(pressKey, '');

describe('evaluate', () => {
  it('× ÷ を + − より先に計算する', () => {
    expect(evaluate('100+200×3')).toBe(700);
    expect(evaluate('1000-600÷2')).toBe(700);
  });

  it('入力途中の末尾の演算子は捨てる', () => {
    expect(evaluate('1200+')).toBe(1200);
  });

  it('円にするため四捨五入する', () => {
    expect(evaluate('1000÷3')).toBe(333);
    expect(evaluate('2000÷3')).toBe(667);
  });

  it('計算できないものは null', () => {
    expect(evaluate('')).toBeNull();
    expect(evaluate('100÷0')).toBeNull();
  });
});

describe('pressKey', () => {
  it('数字を押した順に並べる', () => {
    expect(press('1', '2', '00')).toBe('1200');
  });

  it('数の先頭の 0 は次の数字で置き換える', () => {
    expect(press('0', '5')).toBe('5');
    expect(press('00', '5')).toBe('5');
    expect(press('1', '+', '0', '0', '7')).toBe('1+7');
  });

  it('演算子では始められず、続けて押したら置き換える', () => {
    expect(press('+')).toBe('');
    expect(press('5', '+', '×')).toBe('5×');
  });

  it('= は式を計算結果に置き換え、計算できなければそのまま', () => {
    expect(press('1', '0', '+', '5', '=')).toBe('15');
    expect(press('1', '÷', '0', '=')).toBe('1÷0');
  });

  it('C は全消去、⌫ は 1 文字消去', () => {
    expect(press('1', '2', '⌫')).toBe('1');
    expect(press('1', '2', 'C')).toBe('');
  });

  it('計算結果に続けて入力できる', () => {
    expect(press('1', '0', '-', '3', '0', '=', '+', '5')).toBe('-20+5');
    expect(evaluate('-20+5')).toBe(-15);
  });
});

describe('normalizeExpression', () => {
  it('キーボードの * / を電卓の記号にし、打てない文字は捨てる', () => {
    expect(normalizeExpression('12*3/4')).toBe('12×3÷4');
    expect(normalizeExpression('1,200 円')).toBe('1200');
  });
});

describe('formatExpression', () => {
  it('式の中のそれぞれの数を桁区切りにする', () => {
    expect(formatExpression('1200+800×1000')).toBe('1,200+800×1,000');
    expect(formatExpression('-1234567')).toBe('-1,234,567');
  });

  it('表示を入力欄から戻しても式は変わらない', () => {
    expect(normalizeExpression(formatExpression('12345÷6'))).toBe('12345÷6');
  });
});
