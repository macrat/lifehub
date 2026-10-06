import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import type { MoneyBalance } from '../../../shared/money.ts';
import { formatWindow } from '../../features/money/balance-chart.ts';
import { BalanceChart } from '../../features/money/components/BalanceChart.tsx';
import { accountsQueryOptions, balanceHistory } from '../../features/money/queries.ts';
import { balanceSearchSchema } from '../../features/money/search.ts';
import { useBalanceAccounts, useBalanceChart } from '../../features/money/use-balance-chart.ts';
import { useScreenHistory, useScreenQueries, useStoreQuery } from '../../lib/screen-data.ts';
import { FilterButton } from '../../lib/ui/FilterButton.tsx';
import { FilterPanel } from '../../lib/ui/FilterPanel.tsx';
import { FILL_HEIGHT, FILL_MARGIN_BOTTOM } from '../../lib/ui/layout.ts';
import { EmptyMessage } from '../../lib/ui/QueryView.tsx';
import { SubPageBar } from '../../lib/ui/SubPageBar.tsx';
import { useToggle } from '../../lib/ui/use-toggle.ts';

export const Route = createFileRoute('/_authenticated/money_/balances')({
  validateSearch: balanceSearchSchema,
  // グラフを指で動かす画面なので、引っ張って更新はしない
  staticData: { noPullToRefresh: true },
  component: BalancesPage,
});

/** 読み込む前の推移（描くたびに別の空の配列を作ると、グラフが毎回描き直される） */
const NO_BALANCES: MoneyBalance[] = [];

/**
 * 口座の値の推移（お金の画面の口座のタイルから開く）。選んだ口座の推移を積み上げた、塗りつぶし付きの折れ線グラフ。
 * 銀行は残高、証券は評価額、クレジットカードは負債額（0 より下へ。`MoneyBalance`）。最初は今日までの過去 3 か月を出す。
 * AppBar は戻るボタン・出している期間・絞り込みボタン。絞り込みでは出す口座を選ぶ（URL の accounts。開いたときは
 * 押したタイルの口座だけ）。下部ナビには置かないので、お金のタブの中の画面として扱う（パスが /money で始まる）。
 */
function BalancesPage() {
  const { accounts: selected } = Route.useSearch();
  // この画面が読むもの: 口座（並びと名前）、口座の値の推移
  useScreenQueries([accountsQueryOptions]);
  const history = useScreenHistory(balanceHistory, {});
  const accountsQuery = useStoreQuery(accountsQueryOptions);
  const balances = history.query.data?.items ?? NO_BALANCES;
  const chart = useBalanceChart(balances, history.loadEarlier);
  const panel = useToggle();
  const names = useMemo(
    () => (accountsQuery.data ?? []).map((account) => account.name),
    [accountsQuery.data],
  );
  const toggle = useBalanceAccounts(selected, names);

  return (
    <>
      <SubPageBar title={formatWindow(chart.window)} fallback="/money">
        <FilterButton open={panel.value} count={selected.length} onToggle={panel.toggle} />
      </SubPageBar>
      <Box
        sx={{
          height: FILL_HEIGHT,
          mb: FILL_MARGIN_BOTTOM,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <FilterPanel open={panel.value}>
          {names.map((name) => (
            <FormControlLabel
              key={name}
              label={name}
              control={
                <Checkbox
                  checked={selected.includes(name)}
                  onChange={(e) => toggle(name, e.target.checked)}
                />
              }
            />
          ))}
        </FilterPanel>
        <Box sx={{ flexGrow: 1, minHeight: 0, position: 'relative' }}>
          {selected.length === 0 ? (
            <EmptyMessage>表示する口座を選んでください</EmptyMessage>
          ) : history.ready && balances.length === 0 && !history.loadEarlier ? (
            <EmptyMessage>
              まだ記録がありません（毎日の取り込みで 1 日分ずつ記録します）
            </EmptyMessage>
          ) : (
            <BalanceChart
              balances={balances}
              accounts={names}
              selected={selected}
              axis={chart.axis}
              window={chart.window}
              onWindowChange={chart.onWindowChange}
            />
          )}
        </Box>
      </Box>
    </>
  );
}
