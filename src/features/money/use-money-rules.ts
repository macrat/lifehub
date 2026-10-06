import { arrayMove } from '@dnd-kit/sortable';
import { useState } from 'react';
import { newId } from '../../../shared/id.ts';
import type { MoneyRuleKind } from '../../../shared/money.ts';
import {
  type MoneyRule,
  moneyRuleSchema,
  moneyRulesSchema,
} from '../../../shared/validation/money.ts';
import { useStoreQuery } from '../../lib/screen-data.ts';
import { useUserLabels } from '../users/use-user-labels.ts';
import { rulesQueryOptions, useSaveRules } from './queries.ts';

/** 入力中のルール（形は保存するルールと同じ。正しいとは限らない） */
type RuleDraft = MoneyRule;

/** ルール 1 つの、項目ごとの入力の誤り */
type RuleErrors = Partial<Record<'pattern' | 'replacement' | 'userId', string>>;

/**
 * 入出金の読み替えのルールの管理画面の状態と操作。並び全体を手元に持ち、変えたら並び全体を保存する（`useSaveRules`）。
 * - 保存するのは、すべてのルールが正しいときだけ（正しくないルールは誤りを出して待つ。並びの途中だけを保存すると、
 *   上から順に当てる並びが変わってしまう）
 * - 文字の欄は打つたびではなく欄を離れたときに保存し、スイッチ・選択・並べ替え・追加・削除はその場で保存する
 *   （保存のたびにサーバーが取り込み済みの入出金を読み替え直すので、1 文字ごとには送らない）
 */
export function useMoneyRules() {
  const rulesQuery = useStoreQuery(rulesQueryOptions);
  const save = useSaveRules();
  const { meId } = useUserLabels();
  // 手で変えるまでは保存済みの並びを出す（保存した後も手元の並びを出し続け、取り直しで入力中の欄が揺れないようにする）
  const [draft, setDraft] = useState<RuleDraft[] | null>(null);
  const rules = draft ?? rulesQuery.data ?? [];

  const commit = (next: RuleDraft[]) => {
    setDraft(next);
    const parsed = moneyRulesSchema.safeParse(next);
    if (parsed.success) save.mutate(parsed.data);
  };
  const patch = (id: string, values: Partial<RuleDraft>) =>
    rules.map((rule) => (rule.id === id ? { ...rule, ...values } : rule));

  return {
    rulesQuery,
    rules,
    errorsOf: (rule: RuleDraft): RuleErrors =>
      Object.fromEntries(
        (moneyRuleSchema.safeParse(rule).error?.issues ?? []).map((issue) => [
          issue.path[0],
          issue.message,
        ]),
      ),
    /** 文字の欄を変える（保存は欄を離れたとき。`saveDraft`） */
    edit: (id: string, values: Pick<Partial<RuleDraft>, 'pattern' | 'replacement'>) =>
      setDraft(patch(id, values)),
    /** 手元の並びを保存する（文字の欄を離れたとき） */
    saveDraft: () => commit(rules),
    setReplace: (id: string, replaceDescription: boolean) =>
      commit(patch(id, { replaceDescription })),
    /** 種別を変える。支出なら対象者を外し、入金・出金にしたときは自分を対象者にしておく */
    setKind: (id: string, kind: MoneyRuleKind) =>
      commit(
        patch(id, {
          kind,
          userId: kind === 'spending' ? null : (rules.find((r) => r.id === id)?.userId ?? meId),
        }),
      ),
    setUser: (id: string, userId: string) => commit(patch(id, { userId })),
    setHidden: (id: string, hidden: boolean) => commit(patch(id, { hidden })),
    add: () =>
      commit([
        ...rules,
        {
          id: newId(),
          pattern: '',
          replaceDescription: false,
          replacement: '',
          kind: 'spending',
          userId: null,
          hidden: false,
        },
      ]),
    remove: (id: string) => commit(rules.filter((rule) => rule.id !== id)),
    /** 並べ替え（ドラッグしたルールを、落とした先のルールの位置へ） */
    move: (activeId: string, overId: string) => {
      const from = rules.findIndex((rule) => rule.id === activeId);
      const to = rules.findIndex((rule) => rule.id === overId);
      if (from >= 0 && to >= 0 && from !== to) commit(arrayMove(rules, from, to));
    },
  };
}

export type MoneyRulesState = ReturnType<typeof useMoneyRules>;
