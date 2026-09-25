/**
 * 立替残高の金額（0 なら「精算済み」）の View Transition の名前。ホームのタイル（`BalanceTile`）と
 * 立替画面の残高（`BalanceSummary`）の金額に付け、行き来するときは金額だけがその場から動く
 * （タイルと立替画面の残高は形が違うので、枠ごと動かすと歪んで見える）。名前は画面ごとに 1 つだけなので固定でよい。
 */
export const BALANCE_TRANSITION_NAME = 'balance';
