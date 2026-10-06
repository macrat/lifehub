import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import type { ExpenseInput } from '../../../shared/validation/expenses.ts';
import { ExpenseDetailSheet } from '../../features/expenses/components/ExpenseDetailSheet.tsx';
import { ExpenseFilterForm } from '../../features/expenses/components/ExpenseFilterForm.tsx';
import { ExpenseForm } from '../../features/expenses/components/ExpenseForm.tsx';
import { ExpenseList } from '../../features/expenses/components/ExpenseList.tsx';
import {
  SettlementGrid,
  SettlementGridSkeleton,
} from '../../features/expenses/components/SettlementGrid.tsx';
import { settlementExpense } from '../../features/expenses/parties.ts';
import {
  type Expense,
  expenseHistory,
  totalsQueryOptions,
  useSettlements,
} from '../../features/expenses/queries.ts';
import { AccountGrid, AccountGridSkeleton } from '../../features/money/components/AccountGrid.tsx';
import { TransactionDetailSheet } from '../../features/money/components/TransactionDetailSheet.tsx';
import { TransactionFilterForm } from '../../features/money/components/TransactionFilterForm.tsx';
import { TransactionList } from '../../features/money/components/TransactionList.tsx';
import {
  accountsQueryOptions,
  type MoneyTransaction,
  transactionHistory,
} from '../../features/money/queries.ts';
import {
  expenseListFilter,
  MONEY_FILTER_CONDITIONS,
  type MoneyView,
  moneySearchSchema,
  transactionListFilter,
} from '../../features/money/search.ts';
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
  validateSearch: moneySearchSchema,
  search: { middlewares: [stripSearchParams({ view: 'expenses' })] },
  staticData: { ownsScroll: true },
  component: MoneyPage,
});

/** 上のタイルの段の体裁（精算と口座で同じ） */
const TILES_SX = { px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' } as const;

/**
 * お金。口座のタイル（残高・評価額・カードの次回の引き落とし）と、立替の精算と履歴、Money Forward から取り込んだ入出金の履歴。
 * 一覧は立替と入出金をタブで切り替える（`view`）。どちらも上が新しく下が古い無限スクロールで、タイル・タブと
 * 絞り込みのフォームは一覧の上に貼り付け、下へスクロールすると隠れ、少し戻すと出てくる（絞り込みのフォームを開いている間は隠さない）。
 * - 口座のタイルを押すと、その金融機関で絞り込んだ入出金を開く
 * - 精算のタイルは立替の一覧のときだけ出す。押すとその精算を入れた立替の入力を開く
 * - 行を単押しすると詳細、立替は長押しで編集（アプリ全体の「単押しは閲覧、長押しは編集」。入出金は読むだけ）
 * AppBar の検索窓は出している一覧を内容で絞り込み（絞り込みはサーバーが掛ける）、その右の絞り込みボタンで
 * 一覧ごとの詳細な検索を AppBar の下に開く（タイルは絞り込みに関わらず全体を示す）。
 */
function MoneyPage() {
  const search = Route.useSearch();
  const { view } = search;
  const filter = useFilterSearch(search, MONEY_FILTER_CONDITIONS[view]);
  // この画面が読むもの: 口座、精算の元になる合計、立替と入出金の履歴（タブを切り替えたときにすぐ出せるよう両方を読む）
  useScreenQueries([accountsQueryOptions, totalsQueryOptions]);
  const expenses = useScreenHistory(expenseHistory, expenseListFilter(filter.listFilter));
  const transactions = useScreenHistory(
    transactionHistory,
    transactionListFilter(filter.listFilter),
  );
  const accountsQuery = useStoreQuery(accountsQueryOptions);
  const settlementsQuery = useSettlements();
  // 追加のフォームと、最初に入れておく値（精算のタイルから開くとその精算）
  const adding = useOpenWith<Partial<ExpenseInput>>();
  const expenseSelection = useRecordSelection<Expense>();
  const transactionSelection = useRecordSelection<MoneyTransaction>();

  const openAdd = () => adding.open({});
  useAddShortcut(search.add, openAdd);
  const showView = (next: MoneyView, patch: { account?: string } = {}) =>
    filter.setFilters({ view: next, ...patch });

  const header = (
    <>
      {view === 'expenses' ? (
        <ExpenseFilterForm
          open={filter.panelOpen}
          filters={filter.filters}
          onChange={filter.setFilters}
        />
      ) : (
        <TransactionFilterForm
          open={filter.panelOpen}
          filters={filter.filters}
          accounts={accountsQuery.data?.map((account) => account.name) ?? []}
          onChange={filter.setFilters}
        />
      )}
      {/* 取り込む口座が無ければ（サーバーの環境変数に書いていなければ）段ごと出さない */}
      {accountsQuery.data?.length !== 0 && (
        <Box component="section" aria-label="口座" sx={TILES_SX}>
          <QueryView query={accountsQuery} skeleton={<AccountGridSkeleton />}>
            {(accounts) => (
              <AccountGrid
                accounts={accounts}
                onSelect={(account) => showView('transactions', { account: account.name })}
              />
            )}
          </QueryView>
        </Box>
      )}
      {view === 'expenses' && (
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
      )}
      <Tabs
        value={view}
        onChange={(_, next: MoneyView) => showView(next)}
        variant="fullWidth"
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="立替" value="expenses" />
        <Tab label="入出金" value="transactions" />
      </Tabs>
    </>
  );
  const listProps = { header, headerScrollsAway: !filter.panelOpen };

  return (
    <>
      <AppBarContent>
        <FilterSearchField
          label={view === 'expenses' ? '立替を検索' : '入出金を検索'}
          search={filter}
        />
      </AppBarContent>

      {view === 'expenses' ? (
        <ExpenseList
          {...listProps}
          history={expenses}
          emptyMessage={filter.emptyMessage('立替')}
          onSelect={expenseSelection.open}
        />
      ) : (
        <TransactionList
          {...listProps}
          history={transactions}
          emptyMessage={filter.emptyMessage('入出金')}
          onSelect={transactionSelection.open}
        />
      )}

      <AddFab label="立替を追加" onClick={openAdd} />
      {adding.value && <ExpenseForm initial={adding.value} onClose={adding.close} />}
      {expenseSelection.selected && (
        <ExpenseDetailSheet
          expense={expenseSelection.selected.record}
          initialEditing={expenseSelection.selected.editing}
          onClose={expenseSelection.close}
        />
      )}
      {transactionSelection.selected && (
        <TransactionDetailSheet
          transaction={transactionSelection.selected.record}
          onClose={transactionSelection.close}
        />
      )}
    </>
  );
}
