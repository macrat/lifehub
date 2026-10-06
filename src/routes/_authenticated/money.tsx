import Box from '@mui/material/Box';
import { createFileRoute } from '@tanstack/react-router';
import type { ExpenseInput } from '../../../shared/validation/expenses.ts';
import { ExpenseDetailSheet } from '../../features/expenses/components/ExpenseDetailSheet.tsx';
import { ExpenseFilterForm } from '../../features/expenses/components/ExpenseFilterForm.tsx';
import { ExpenseForm } from '../../features/expenses/components/ExpenseForm.tsx';
import {
  SettlementGrid,
  SettlementGridSkeleton,
} from '../../features/expenses/components/SettlementGrid.tsx';
import { settlementExpense } from '../../features/expenses/parties.ts';
import { totalsQueryOptions, useSettlements } from '../../features/expenses/queries.ts';
import { EXPENSE_FILTER_CONDITIONS, expenseSearchSchema } from '../../features/expenses/search.ts';
import { AccountGrid, AccountGridSkeleton } from '../../features/money/components/AccountGrid.tsx';
import { MoneyList } from '../../features/money/components/MoneyList.tsx';
import { TransactionDetailSheet } from '../../features/money/components/TransactionDetailSheet.tsx';
import {
  accountsQueryOptions,
  type MoneyEntry,
  moneyHistory,
} from '../../features/money/queries.ts';
import { useAddShortcut } from '../../lib/add-search.ts';
import { useScreenHistory, useScreenQueries, useStoreQuery } from '../../lib/screen-data.ts';
import { useFilterSearch } from '../../lib/search.ts';
import { AddFab } from '../../lib/ui/AddFab.tsx';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';
import { FilterSearchField } from '../../lib/ui/FilterSearchField.tsx';
import { QueryView } from '../../lib/ui/QueryView.tsx';
import { useRecordSelection } from '../../lib/ui/use-record-selection.ts';
import { useOpenWith } from '../../lib/ui/use-toggle.ts';

export const Route = createFileRoute('/_authenticated/money')({
  validateSearch: expenseSearchSchema,
  staticData: { ownsScroll: true },
  component: MoneyPage,
});

/** 上のタイルの段の体裁（口座と精算で同じ） */
const TILES_SX = { px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' } as const;

/**
 * お金。口座のタイル（残高・評価額・カードの次回の引き落とし）、立替の精算、立替と取り込んだ入出金を 1 本に並べた履歴。
 * 精算は専用の操作ではなく「誰かが誰かに払った額」を立替として追加し、精算のタイルをタップするとその精算を入れた入力が開く。
 * 履歴は上が新しく下が古い無限スクロールで、最初に出す位置は `HistoryList` が決め、下へ進むと古いほうのページを読む。
 * 絞り込みのフォームとタイルは一覧の上に貼り付け、ホームのタイルと同じく下へスクロールすると隠れ、少し戻すと出てくる
 * （絞り込みのフォームを開いている間は隠さない）。
 * 履歴は日ごとの見出しと 1 件 1 行（カレンダーのリスト表示と同じ体裁）。行を単押しすると詳細、立替は長押しすると
 * その詳細が編集で開く（アプリ全体の「単押しは閲覧、長押しは編集」。入出金は読むだけなので長押しでも閲覧）。削除は詳細の三点リーダーの中。
 * AppBar の検索窓とその右の絞り込みボタン（金額・日付の範囲と To・From）は立替の一覧と同じ条件で、入出金にも同じ条件を
 * 読み替えて掛ける（絞り込みはサーバーが掛ける）。タイルは絞り込みに関わらず全体を示す。
 */
function MoneyPage() {
  const search = Route.useSearch();
  const filter = useFilterSearch(search, EXPENSE_FILTER_CONDITIONS);
  // この画面が読むもの: 口座、精算の元になる合計、絞り込んだ履歴
  useScreenQueries([accountsQueryOptions, totalsQueryOptions]);
  const history = useScreenHistory(moneyHistory, filter.listFilter);
  const accountsQuery = useStoreQuery(accountsQueryOptions);
  const settlementsQuery = useSettlements();
  // 追加のフォームと、最初に入れておく値（精算のタイルから開くとその精算）
  const adding = useOpenWith<Partial<ExpenseInput>>();
  const selection = useRecordSelection<MoneyEntry>();
  const selected = selection.selected;

  const openAdd = () => adding.open({});
  useAddShortcut(search.add, openAdd);

  const header = (
    <>
      <ExpenseFilterForm
        open={filter.panelOpen}
        filters={filter.filters}
        onChange={filter.setFilters}
      />
      {/* 取り込む口座が無ければ（サーバーの環境変数に書いていなければ）段ごと出さない */}
      {accountsQuery.data?.length !== 0 && (
        <Box component="section" aria-label="口座" sx={TILES_SX}>
          <QueryView query={accountsQuery} skeleton={<AccountGridSkeleton />}>
            {(accounts) => <AccountGrid accounts={accounts} />}
          </QueryView>
        </Box>
      )}
      <Box component="section" aria-label="精算" sx={TILES_SX}>
        <QueryView query={settlementsQuery} skeleton={<SettlementGridSkeleton />}>
          {(settlements) => (
            <SettlementGrid
              settlements={settlements}
              onSelect={(s) => adding.open(settlementExpense(s))}
            />
          )}
        </QueryView>
      </Box>
    </>
  );

  return (
    <>
      <AppBarContent>
        <FilterSearchField label="記録を検索" search={filter} />
      </AppBarContent>

      <MoneyList
        history={history}
        header={header}
        headerScrollsAway={!filter.panelOpen}
        emptyMessage={filter.filtering ? filter.emptyMessage('記録') : '記録がありません'}
        onSelect={selection.open}
      />

      <AddFab label="立替を追加" onClick={openAdd} />
      {adding.value && <ExpenseForm initial={adding.value} onClose={adding.close} />}
      {selected?.record.type === 'expense' && (
        <ExpenseDetailSheet
          expense={selected.record.expense}
          initialEditing={selected.editing}
          onClose={selection.close}
        />
      )}
      {selected?.record.type === 'transaction' && (
        <TransactionDetailSheet
          transaction={selected.record.transaction}
          onClose={selection.close}
        />
      )}
    </>
  );
}
