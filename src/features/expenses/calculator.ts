/**
 * 金額欄をそのまま入力欄にする電卓。式は表示と同じ記号（× ÷）のまま持ち、
 * 変換層を挟まない。金額は整数の円なので、小数点は入力できず結果は四捨五入する。
 */

const OPERATORS = ['+', '-', '×', '÷'] as const;
type Operator = (typeof OPERATORS)[number];

/** 電卓のキーの並び（1 要素 = 1 行）。C は全消去、⌫ は 1 文字消去 */
export const CALCULATOR_KEYS = [
  ['C', '⌫', '÷', '×'],
  ['7', '8', '9', '-'],
  ['4', '5', '6', '+'],
  ['1', '2', '3', '='],
  ['0', '00'],
] as const;
export type CalculatorKey = (typeof CALCULATOR_KEYS)[number][number];

function isOperator(value: string | undefined): value is Operator {
  return OPERATORS.includes(value as Operator);
}

/**
 * 式を計算する。× ÷ を + − より先に計算し、末尾の演算子は入力途中として捨てる（"100+" は 100）。
 * 空や 0 除算など計算できないものは null。
 */
export function evaluate(expression: string): number | null {
  const tokens = expression.match(/\d+|[+\-×÷]/g) ?? [];
  if (isOperator(tokens.at(-1))) tokens.pop();
  if (tokens.length === 0) return null;

  // 加減で確定した合計（total）と、× ÷ で畳み込み中の項（term）に分けて 1 回の走査で計算する
  let total = 0;
  let term = 0;
  let sign = 1;
  let pendingMul: Operator | null = null;
  for (const token of tokens) {
    if (token === '+' || token === '-') {
      total += sign * term;
      sign = token === '+' ? 1 : -1;
      term = 0;
      pendingMul = null;
    } else if (isOperator(token)) {
      pendingMul = token;
    } else {
      const value = Number(token);
      if (pendingMul === '×') term *= value;
      else if (pendingMul === '÷') {
        if (value === 0) return null;
        term /= value;
      } else term = value;
      pendingMul = null;
    }
  }
  return Math.round(total + sign * term);
}

/** キーを押した後の式。式の組み立てはここだけで行う */
export function pressKey(expression: string, key: CalculatorKey): string {
  if (key === 'C') return '';
  if (key === '⌫') return expression.slice(0, -1);
  if (key === '=') {
    const result = evaluate(expression);
    return result === null ? expression : String(result);
  }
  if (isOperator(key)) {
    // 演算子では始められず、続けて押したら置き換える
    if (expression === '') return '';
    return isOperator(expression.at(-1)) ? expression.slice(0, -1) + key : expression + key;
  }
  // 数の先頭の 0 は意味が無いので、次の数字で置き換える（"0" → "5" は "05" にしない）
  const base = /(?:^|[+\-×÷])0$/.test(expression) ? expression.slice(0, -1) : expression;
  const head = base === '' || isOperator(base.at(-1));
  return base + (head && /^0+$/.test(key) ? '0' : key);
}

/** キーボードから直接打たれた文字を式に直す。電卓のキーで打てないものは捨てる */
export function normalizeExpression(input: string): string {
  return input
    .replace(/[*x]/gi, '×')
    .replace(/\//g, '÷')
    .replace(/[^\d+\-×÷]/g, '');
}
