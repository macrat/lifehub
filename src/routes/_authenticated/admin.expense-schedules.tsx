import { createFileRoute } from '@tanstack/react-router';
import type { ExpenseSchedule } from '../../../shared/money.ts';
import { ExpenseScheduleList } from '../../features/money/components/ExpenseScheduleList.tsx';
import { ExpenseScheduleSheet } from '../../features/money/components/ExpenseScheduleSheet.tsx';
import { expenseSchedulesQueryOptions } from '../../features/money/queries.ts';
import { useScreenQueries, useStoreQuery } from '../../lib/screen-data.ts';
import { AddFab } from '../../lib/ui/AddFab.tsx';
import { ListSkeleton, QueryView } from '../../lib/ui/QueryView.tsx';
import { SubPageBar } from '../../lib/ui/SubPageBar.tsx';
import { useOpenWith } from '../../lib/ui/use-toggle.ts';

export const Route = createFileRoute('/_authenticated/admin/expense-schedules')({
  // 引いて取り直したい内容を持たず、入力のシートを開いて使う画面なので、引っ張って更新はしない
  staticData: { noPullToRefresh: true },
  component: AdminExpenseSchedulesPage,
});

/**
 * 立替スケジュール（設定の「お金」から開く）。日が来たら決まった内容の立替を自動で記録する（共有口座への定期の入金、
 * 個人の口座からの口座振替の支払い）。立替スケジュールの追加・変更・削除はこの画面だけで行う。
 * 規則は docs/features/money.md の「立替スケジュール」
 */
function AdminExpenseSchedulesPage() {
  // この画面が読むもの: 立替スケジュール
  useScreenQueries([expenseSchedulesQueryOptions]);
  const schedulesQuery = useStoreQuery(expenseSchedulesQueryOptions);
  // 開いているシート: null は追加、スケジュールはその変更
  const sheet = useOpenWith<{ schedule: ExpenseSchedule | null }>();
  return (
    <>
      <SubPageBar title="立替スケジュール" fallback="/settings" />
      <QueryView query={schedulesQuery} skeleton={<ListSkeleton rows={2} />}>
        {(schedules) => (
          <ExpenseScheduleList
            schedules={schedules}
            onEdit={(schedule) => sheet.open({ schedule })}
          />
        )}
      </QueryView>
      <AddFab label="立替スケジュールを追加" onClick={() => sheet.open({ schedule: null })} />
      {sheet.value && (
        <ExpenseScheduleSheet schedule={sheet.value.schedule} onClose={sheet.close} />
      )}
    </>
  );
}
