import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { createFileRoute } from '@tanstack/react-router';
import { formatWindow } from '../../features/money/balance-chart.ts';
import { BalanceChart } from '../../features/money/components/BalanceChart.tsx';
import { accountsQueryOptions, balanceHistory } from '../../features/money/queries.ts';
import { balanceSearchSchema } from '../../features/money/search.ts';
import { useBalanceAccounts, useBalanceChart } from '../../features/money/use-balance-chart.ts';
import { useScreenHistory, useScreenQueries, useStoreQuery } from '../../lib/screen-data.ts';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';
import { FilterButton } from '../../lib/ui/FilterButton.tsx';
import { FilterPanel } from '../../lib/ui/FilterPanel.tsx';
import { FILL_HEIGHT, FILL_MARGIN_BOTTOM } from '../../lib/ui/layout.ts';
import { useGoBack } from '../../lib/ui/use-go-back.ts';
import { useToggle } from '../../lib/ui/use-toggle.ts';

export const Route = createFileRoute('/_authenticated/money_/balances')({
  validateSearch: balanceSearchSchema,
  // グラフを指で動かす画面なので、引っ張って更新はしない
  staticData: { noPullToRefresh: true },
  component: BalancesPage,
});

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
  const balances = history.query.data?.items ?? [];
  const chart = useBalanceChart(balances, history.loadEarlier);
  const goBack = useGoBack('/money');
  const panel = useToggle();
  const names = (accountsQuery.data ?? []).map((account) => account.name);
  const toggle = useBalanceAccounts(selected, names);

  return (
    <>
      <AppBarContent>
        <IconButton aria-label="戻る" onClick={goBack} size="small">
          <ArrowBackIosNewIcon fontSize="small" />
        </IconButton>
        <Typography component="h1" variant="subtitle1" noWrap sx={{ flexGrow: 1 }}>
          {formatWindow(chart.window)}
        </Typography>
        <FilterButton open={panel.value} count={0} onToggle={panel.toggle} />
      </AppBarContent>
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
            <Message>表示する口座を選んでください</Message>
          ) : history.ready && balances.length === 0 && !history.loadEarlier ? (
            <Message>まだ記録がありません（毎日の取り込みで 1 日分ずつ記録します）</Message>
          ) : (
            <BalanceChart balances={balances} accounts={names} selected={selected} state={chart} />
          )}
        </Box>
      </Box>
    </>
  );
}

function Message({ children }: { children: string }) {
  return (
    <Typography color="textSecondary" sx={{ p: 4, textAlign: 'center' }}>
      {children}
    </Typography>
  );
}
