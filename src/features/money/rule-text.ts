import type { MoneyRuleKind } from '../../../shared/money.ts';
import type { MoneyRule } from '../../../shared/validation/money.ts';

/** 種別の呼び方（支出はただの支出、入金・出金は対象者と「共有」との立替） */
export const KIND_LABELS: Record<MoneyRuleKind, string> = {
  spending: '支出',
  deposit: '入金',
  withdrawal: '出金',
};

/** 一覧の説明: 置換後の内容欄・種別と対象者・一覧に表示しないか（「「$1 さん」に置換・入金 太郎・一覧に表示しない」） */
export function describeRule(rule: MoneyRule, label: (userId: string | null) => string): string {
  return [
    rule.replaceDescription ? `「${rule.replacement}」に置換` : null,
    rule.kind === 'spending'
      ? KIND_LABELS.spending
      : `${KIND_LABELS[rule.kind]} ${label(rule.userId)}`,
    rule.hidden ? '一覧に表示しない' : null,
  ]
    .filter((part) => part !== null)
    .join('・');
}
