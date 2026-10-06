import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { createLink } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { DateString } from '../../../../shared/types.ts';
import { useStoreQuery } from '../../../lib/screen-data.ts';
import { QueryView } from '../../../lib/ui/QueryView.tsx';
import { accountsQueryOptions, type MoneyAccount } from '../queries.ts';
import { AccountGrid, AccountGridSkeleton } from './AccountGrid.tsx';

// MUI のタブを router のリンクにする（`component={Link}` では to と search の型が MUI の props の推論に埋もれる）
const TabLink = createLink(Tab);

/** 上のタイルの段（口座と、立替の一覧の精算で同じ体裁）。label は読み上げの名前 */
export function TileSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box
      component="section"
      aria-label={label}
      sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
    >
      {children}
    </Box>
  );
}

/** 一覧を切り替えても続ける絞り込み（両方の一覧にある条件） */
type SharedSearch = {
  q?: string | undefined;
  since?: DateString | undefined;
  until?: DateString | undefined;
};

type Props = {
  /** 出している一覧 */
  current: 'expenses' | 'transactions';
  /** 一覧を切り替えても続ける絞り込み */
  shared: SharedSearch;
  /** 口座のタイルを押したとき */
  onSelectAccount: (account: MoneyAccount) => void;
  /** 口座のタイルとタブの間に置くもの（立替の一覧の精算） */
  children?: ReactNode;
};

/**
 * お金の画面の、一覧の上に貼り付く段。口座のタイルと、立替・入出金のタブ（それぞれの一覧の画面へのリンク）。
 * 口座は画面が購読した `accountsQueryOptions` を読み、取り込む口座が無ければ（サーバーの環境変数に書いていなければ）
 * 段ごと出さない。タブを切り替えても、両方の一覧にある絞り込み（キーワードと日付の範囲）は続ける。
 */
export function MoneyHeader({ current, shared, onSelectAccount, children }: Props) {
  const accountsQuery = useStoreQuery(accountsQueryOptions);
  return (
    <>
      {accountsQuery.data?.length !== 0 && (
        <TileSection label="口座">
          <QueryView query={accountsQuery} skeleton={<AccountGridSkeleton />}>
            {(accounts) => <AccountGrid accounts={accounts} onSelect={onSelectAccount} />}
          </QueryView>
        </TileSection>
      )}
      {children}
      <Tabs value={current} variant="fullWidth" sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <TabLink label="立替" value="expenses" to="/money" search={shared} replace />
        <TabLink
          label="入出金"
          value="transactions"
          to="/money/transactions"
          search={shared}
          replace
        />
      </Tabs>
    </>
  );
}
