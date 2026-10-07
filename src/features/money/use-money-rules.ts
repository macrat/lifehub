import { arrayMove } from '@dnd-kit/sortable';
import type { MoneyRule } from '../../../shared/validation/money.ts';
import { putById } from '../../lib/list.ts';
import { useStoreQuery } from '../../lib/screen-data.ts';
import { rulesQueryOptions, useSaveRules } from './queries.ts';

/**
 * 取り込みルールの画面の状態と操作。並びは保存済みのルール（`rulesQueryOptions`）で、変えたら並び全体を保存する
 * （`useSaveRules`。サーバーは保存のたびに取り込み済みの入出金を読み替え直す）。ルール 1 つの入力はシート
 * （`MoneyRuleSheet`）が持ち、ここは並びへの出し入れと並べ替えだけを持つ。
 */
export function useMoneyRules() {
  const rulesQuery = useStoreQuery(rulesQueryOptions);
  const save = useSaveRules();
  const rules = rulesQuery.data ?? [];
  return {
    rulesQuery,
    /** シートで保存したルールを並びに入れる（同じ id なら置き換え、新しいルールは末尾） */
    put: (rule: MoneyRule) => save.mutateAsync(putById(rules, rule.id, rule)),
    remove: (id: string) => save.mutate(putById(rules, id, null)),
    /** 並べ替え（引いたルールを、落とした先のルールの位置へ） */
    move: (activeId: string, overId: string) => {
      const from = rules.findIndex((rule) => rule.id === activeId);
      const to = rules.findIndex((rule) => rule.id === overId);
      if (from >= 0 && to >= 0 && from !== to) save.mutate(arrayMove(rules, from, to));
    },
  };
}
