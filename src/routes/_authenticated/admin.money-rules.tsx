import { createFileRoute } from '@tanstack/react-router';
import type { MoneyRule } from '../../../shared/validation/money.ts';
import { MoneyRuleList } from '../../features/money/components/MoneyRuleList.tsx';
import { MoneyRuleSheet } from '../../features/money/components/MoneyRuleSheet.tsx';
import { rulesQueryOptions } from '../../features/money/queries.ts';
import { useMoneyRules } from '../../features/money/use-money-rules.ts';
import { useScreenQueries } from '../../lib/screen-data.ts';
import { AddFab } from '../../lib/ui/AddFab.tsx';
import { ListSkeleton, QueryView } from '../../lib/ui/QueryView.tsx';
import { SubPageBar } from '../../lib/ui/SubPageBar.tsx';
import { useOpenWith } from '../../lib/ui/use-toggle.ts';

export const Route = createFileRoute('/_authenticated/admin/money-rules')({
  // 引いて取り直したい内容を持たず、行を引いて並べ替える画面なので、引っ張って更新はしない
  staticData: { noPullToRefresh: true },
  component: AdminMoneyRulesPage,
});

/**
 * 取り込みルール（設定の「お金」から開く）。Money Forward から取り込んだ入出金の内容欄を読み替え、
 * 入金・出金を「共有」との立替として精算に入れる。規則は docs/features/money.md の「取り込みルール」
 */
function AdminMoneyRulesPage() {
  // この画面が読むもの: ルールの並び
  useScreenQueries([rulesQueryOptions]);
  const state = useMoneyRules();
  // 開いているシート: rule が null なら追加
  const sheet = useOpenWith<{ rule: MoneyRule | null }>();
  return (
    <>
      <SubPageBar title="取り込みルール" fallback="/settings" />
      <QueryView query={state.rulesQuery} skeleton={<ListSkeleton rows={2} />}>
        {() => (
          <MoneyRuleList
            rules={state.rules}
            onMove={state.move}
            onEdit={(rule) => sheet.open({ rule })}
          />
        )}
      </QueryView>
      <AddFab label="ルールを追加" onClick={() => sheet.open({ rule: null })} />
      {sheet.value && (
        <MoneyRuleSheet
          rule={sheet.value.rule}
          onSubmit={state.put}
          onDelete={state.remove}
          onClose={sheet.close}
        />
      )}
    </>
  );
}
