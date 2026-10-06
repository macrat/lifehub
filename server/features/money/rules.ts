import { fullMatch, type Parties, transferParties } from '../../../shared/money.ts';
import type { MoneyRule } from '../../../shared/validation/money.ts';

/**
 * ルールで読み替えた入出金（`money_records` の読み替えた後の列）。当事者は、入金・出金のルールなら「共有」との立替の
 * From・To（`transferParties`）、支出か、どれにも当たらなければどちらも null（ただの支出）
 */
export type Rewritten = Parties & {
  description: string;
  /** 一覧（お金の画面・タイムライン）に出さないか */
  hidden: boolean;
};

/** どのルールにも当たらない、ただの支出の当事者 */
const NO_PARTIES: Parties = { fromUserId: null, toUserId: null };

/**
 * 元の内容欄にルールを上から順に当て、最初に当たったルールで読み替える。どれにも当たらなければ元のまま（ただの支出で、一覧に出す）。
 * パターンは内容欄全体と一致したときだけ当たる（`^` と `$` で囲んだのと同じ。`fullMatch`）。
 * WHY 完全一致: 部分一致だと、短いパターンが思わぬ内容欄にも当たり、上から順に見るので後ろのルールを黙って隠す。
 * 書いたパターンがそのまま内容欄の形になっていれば、どの明細に当たるかを読み違えない。
 * 置換は内容欄全体を置換後の内容欄にする（当たった部分だけを置き換えるのではない）。置換後の内容欄には
 * `String.prototype.replace` と同じ書き方で、当たった所（$&）・キャプチャ（$1、$<名前>）・$ そのもの（$$）を差し込める。
 * WHY 全体を置き換える: 管理画面の欄は「置換後の内容欄」で、Money Forward の長い内容欄（「AMAZON.CO.JP 1234...」）を
 * 短い名前にしたいとき、当たった部分だけを置き換えると残りが付いてくる。
 * パターンは最初に 1 度だけ正規表現にし、返す関数を内容欄ごとに呼ぶ（保存のたびに数千件の入出金へ当てる）。
 */
export function applyRules(rules: readonly MoneyRule[]): (original: string) => Rewritten {
  const compiled = rules.map((rule) => ({ rule, pattern: fullMatch(rule.pattern) }));
  return (original) => {
    for (const { rule, pattern } of compiled) {
      const match = pattern.exec(original);
      if (!match) continue;
      return {
        ...(rule.kind === 'spending' || rule.userId === null
          ? NO_PARTIES
          : transferParties(rule.kind, rule.userId)),
        description: rule.replaceDescription ? expand(rule.replacement, match) : original,
        hidden: rule.hidden,
      };
    }
    return { ...NO_PARTIES, description: original, hidden: false };
  };
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
