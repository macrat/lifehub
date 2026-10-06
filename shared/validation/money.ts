import { z } from 'zod';
import { fullMatch, MONEY_RULE_KINDS } from '../money.ts';
import { uuidSchema } from './common.ts';

/** 正規表現として読めるか（ルールのパターンを当てるときと同じ、全体に一致させる形で。サーバーとフォームが同じ規則で確かめる） */
function isRegExp(pattern: string): boolean {
  try {
    fullMatch(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * 入出金の読み替えのルール 1 つ。id はクライアントが決める（並べ替え・入力中の行を見分ける鍵で、保存しても変わらない）。
 * - 置換しないなら置換後の内容欄は使わない（空でよい）。置換するなら空にはできない
 * - 支出なら対象者は持たない（null にそろえる）。入金・出金なら対象者が要る
 */
export const moneyRuleSchema = z
  .object({
    id: uuidSchema,
    pattern: z
      .string()
      .min(1, 'パターンを入力してください')
      .max(200)
      .refine(isRegExp, '正規表現として読めません'),
    replaceDescription: z.boolean(),
    replacement: z.string().trim().max(200),
    kind: z.enum(MONEY_RULE_KINDS),
    userId: uuidSchema.nullable(),
  })
  .refine((rule) => !rule.replaceDescription || rule.replacement !== '', {
    message: '置換後の内容欄を入力してください',
    path: ['replacement'],
  })
  .refine((rule) => rule.kind === 'spending' || rule.userId !== null, {
    message: '対象者を選んでください',
    path: ['userId'],
  })
  .transform((rule) => (rule.kind === 'spending' ? { ...rule, userId: null } : rule));
export type MoneyRule = z.output<typeof moneyRuleSchema>;

/** ルールの並び全体（上から順に当てる）。保存は並び全体の置き換え（`money.saveRules`） */
export const moneyRulesSchema = z.array(moneyRuleSchema).max(100, 'ルールは 100 個までです');
