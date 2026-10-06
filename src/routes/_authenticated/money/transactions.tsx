import { createFileRoute } from '@tanstack/react-router';
import { MoneyHeader } from '../../../features/money/components/MoneyHeader.tsx';
import { TransactionDetailSheet } from '../../../features/money/components/TransactionDetailSheet.tsx';
import { TransactionFilterForm } from '../../../features/money/components/TransactionFilterForm.tsx';
import { TransactionList } from '../../../features/money/components/TransactionList.tsx';
import {
  accountsQueryOptions,
  type MoneyTransaction,
  transactionHistory,
} from '../../../features/money/queries.ts';
import {
  TRANSACTION_FILTER_CONDITIONS,
  transactionSearchSchema,
} from '../../../features/money/search.ts';
import { useScreenHistory, useScreenQueries, useStoreQuery } from '../../../lib/screen-data.ts';
import { useFilterSearch } from '../../../lib/search.ts';
import { AppBarContent } from '../../../lib/ui/app-bar-slot.tsx';
import { FilterSearchField } from '../../../lib/ui/FilterSearchField.tsx';
import { useRecordSelection } from '../../../lib/ui/use-record-selection.ts';

export const Route = createFileRoute('/_authenticated/money/transactions')({
  validateSearch: transactionSearchSchema,
  staticData: { ownsScroll: true },
  component: TransactionsPage,
});

/**
 * お金の画面の「入出金」。口座のタイルと、Money Forward から取り込んだ入出金の履歴（読むだけ）。
 * 体裁と振る舞いは「立替」（`/money`）と同じで、口座のタイルを押すとその金融機関で絞り込む。
 * AppBar の検索窓は内容と分類で履歴を絞り込み、その右の絞り込みボタンで日付の範囲と金融機関の詳細な検索を開く。
 */
function TransactionsPage() {
  const search = Route.useSearch();
  const filter = useFilterSearch(search, TRANSACTION_FILTER_CONDITIONS);
  // この画面が読むもの: 口座と、絞り込んだ履歴
  useScreenQueries([accountsQueryOptions]);
  const history = useScreenHistory(transactionHistory, filter.listFilter);
  const accounts = useStoreQuery(accountsQueryOptions).data ?? [];
  const selection = useRecordSelection<MoneyTransaction>();
  const { q, since, until } = filter.listFilter;

  const header = (
    <>
      <TransactionFilterForm
        open={filter.panelOpen}
        filters={filter.filters}
        accounts={accounts.map((account) => account.name)}
        onChange={filter.setFilters}
      />
      <MoneyHeader
        current="transactions"
        shared={{ q, since, until }}
        onSelectAccount={(account) => filter.setFilters({ account: account.name })}
      />
    </>
  );

  return (
    <>
      <AppBarContent>
        <FilterSearchField label="入出金を検索" search={filter} />
      </AppBarContent>

      <TransactionList
        history={history}
        header={header}
        headerScrollsAway={!filter.panelOpen}
        emptyMessage={filter.emptyMessage('入出金')}
        onSelect={selection.open}
      />

      {selection.selected && (
        <TransactionDetailSheet transaction={selection.selected.record} onClose={selection.close} />
      )}
    </>
  );
}
