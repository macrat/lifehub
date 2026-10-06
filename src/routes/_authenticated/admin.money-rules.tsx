import { createFileRoute } from '@tanstack/react-router';
import { MoneyRuleList } from '../../features/money/components/MoneyRuleList.tsx';
import { rulesQueryOptions } from '../../features/money/queries.ts';
import { useMoneyRules } from '../../features/money/use-money-rules.ts';
import { useScreenQueries } from '../../lib/screen-data.ts';
import { AddFab } from '../../lib/ui/AddFab.tsx';
import { ListSkeleton, QueryView } from '../../lib/ui/QueryView.tsx';

export const Route = createFileRoute('/_authenticated/admin/money-rules')({
  // 引いて取り直したい内容を持たず、ドラッグで並べ替える画面なので、引っ張って更新はしない
  staticData: { noPullToRefresh: true },
  component: AdminMoneyRulesPage,
});

/**
 * 入出金の読み替えのルール（設定の「お金」から開く）。Money Forward から取り込んだ入出金の内容欄を読み替え、
 * 入金・出金を「共有」との立替として精算に入れる。規則は docs/features/money.md の「入出金のルール」
 */
function AdminMoneyRulesPage() {
  // この画面が読むもの: ルールの並び
  useScreenQueries([rulesQueryOptions]);
  const state = useMoneyRules();
  return (
    <>
      <QueryView query={state.rulesQuery} skeleton={<ListSkeleton rows={2} />}>
        {() => <MoneyRuleList state={state} />}
      </QueryView>
      <AddFab label="ルールを追加" onClick={state.add} />
    </>
  );
}
