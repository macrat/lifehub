import { fullMatch, type MoneyRuleKind } from '../../../shared/money.ts';
import type { MoneyRule } from '../../../shared/validation/money.ts';

/** ルールで読み替えた入出金（`money_transactions` の読み替えた後の列） */
export type Rewritten = {
  description: string;
  direction: Exclude<MoneyRuleKind, 'spending'> | null;
  userId: string | null;
};

/**
 * 元の内容欄にルールを上から順に当て、最初に当たったルールで読み替える。どれにも当たらなければ元のまま（ただの支出）。
 * パターンは内容欄全体と一致したときだけ当たる（`^` と `$` で囲んだのと同じ。`fullMatch`）。
 * WHY 完全一致: 部分一致だと、短いパターンが思わぬ内容欄にも当たり、上から順に見るので後ろのルールを黙って隠す。
 * 書いたパターンがそのまま内容欄の形になっていれば、どの明細に当たるかを読み違えない。
 * 置換は内容欄全体を置換後の内容欄にする（当たった部分だけを置き換えるのではない）。置換後の内容欄には
 * `String.prototype.replace` と同じ書き方で、当たった所（$&）・キャプチャ（$1、$<名前>）・$ そのもの（$$）を差し込める。
 * WHY 全体を置き換える: 管理画面の欄は「置換後の内容欄」で、Money Forward の長い内容欄（「AMAZON.CO.JP 1234...」）を
 * 短い名前にしたいとき、当たった部分だけを置き換えると残りが付いてくる。
 */
export function applyRules(rules: readonly MoneyRule[], original: string): Rewritten {
  for (const rule of rules) {
    const match = fullMatch(rule.pattern).exec(original);
    if (!match) continue;
    return {
      description: rule.replaceDescription ? expand(rule.replacement, match) : original,
      direction: rule.kind === 'spending' ? null : rule.kind,
      userId: rule.kind === 'spending' ? null : rule.userId,
    };
  }
  return { description: original, direction: null, userId: null };
}

/** 置換後の内容欄の $ の書き方を、当たった所とキャプチャで埋める（無いキャプチャは空にする） */
function expand(template: string, match: RegExpExecArray): string {
  return template.replace(/\$(\$|&|\d{1,2}|<([^>]*)>)/g, (token, ref: string, name?: string) => {
    if (ref === '$') return '$';
    if (ref === '&') return match[0];
    if (name !== undefined) return match.groups?.[name] ?? '';
    const index = Number(ref);
    return index < match.length ? (match[index] ?? '') : token;
  });
}
