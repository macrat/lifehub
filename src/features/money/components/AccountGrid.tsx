import { formatDate } from '../../../lib/date.ts';
import { StatusTile, StatusTileSkeleton, TileGrid } from '../../../lib/ui/StatusTile.tsx';
import { formatYen } from '../../../lib/yen.ts';
import type { MoneyAccount } from '../queries.ts';

/** スマホは 2 列、広い画面は 4 列（口座は数枚なので、1〜2 行に収まる） */
const COLUMNS = { xs: 2, md: 4 };

/** 値が読めていないときの表示（取り込む前、または Money Forward の画面から読めなかった） */
const UNKNOWN = '—';

type Props = {
  accounts: MoneyAccount[];
  /** タイルを押したとき。その口座の入出金を開く */
  onSelect: (account: MoneyAccount) => void;
};

/**
 * 口座のタイル（お金の画面）。並びはサーバーの環境変数に書いた順。
 * 銀行は残高、証券は評価額、クレジットカードは次回の引き落とし額と日を出す（種類は `MoneyAccount` の kind）。
 * タイルはレモン・精算と同じもの（`StatusTile`）。
 */
export function AccountGrid({ accounts, onSelect }: Props) {
  return (
    <TileGrid columns={COLUMNS}>
      {accounts.map((account) => (
        <StatusTile
          key={account.name}
          label={account.name}
          {...tileValues(account)}
          onClick={() => onSelect(account)}
        />
      ))}
    </TileGrid>
  );
}

function tileValues(account: MoneyAccount): { value: string; sub: string } {
  const yen = (amount: number | null) => (amount === null ? UNKNOWN : formatYen(amount));
  switch (account.kind) {
    case 'bank':
      return { value: yen(account.balance), sub: '残高' };
    case 'securities':
      return { value: yen(account.balance), sub: '評価額' };
    case 'card':
      return {
        value: yen(account.withdrawalAmount),
        sub: account.withdrawalOn
          ? `${formatDate(account.withdrawalOn)} 引き落とし`
          : '次回の引き落とし',
      };
  }
}

/** 読み込み中の骨組み。口座の数は読むまで分からないので、1 行分 */
export function AccountGridSkeleton() {
  return (
    <TileGrid columns={COLUMNS}>
      <StatusTileSkeleton />
      <StatusTileSkeleton />
    </TileGrid>
  );
}
