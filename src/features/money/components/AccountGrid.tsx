import type { MoneyAccount } from '../../../../shared/money.ts';
import { formatMonthDay } from '../../../lib/date.ts';
import { StatusTile, StatusTileSkeleton, TileGrid } from '../../../lib/ui/StatusTile.tsx';
import { formatSignedYen, formatYen } from '../../../lib/yen.ts';

/**
 * スマホは 3 列、広い画面は 4 列（口座は数枚なので、1〜2 行に収まる）。
 * スマホの 3 列でも 7 桁（100 万円台）の金額が収まるよう、値の字は小さめにする（`StatusTile` の size small）
 */
const COLUMNS = { xs: 3, md: 4 };

/** 値が読めていないときの表示（取り込む前、または Money Forward の画面から読めなかった） */
const UNKNOWN = '—';

type Props = {
  accounts: MoneyAccount[];
  /** タイルを押したとき（その口座の推移を開く） */
  onSelect: (account: MoneyAccount) => void;
};

/**
 * 口座のタイル（お金の画面）。並びはサーバーの環境変数に書いた順。
 * 銀行は残高、証券は評価額と、その下に 30 日前の値からの差（`MoneyAccount` の balanceChange）を出す。
 * クレジットカードは次回の引き落とし額と日を出す（種類は `MoneyAccount` の kind）。
 * タイルはレモン・精算と同じもの（`StatusTile`）。押すとその口座の値の推移が開く。
 */
export function AccountGrid({ accounts, onSelect }: Props) {
  return (
    <TileGrid columns={COLUMNS}>
      {accounts.map((account) => (
        <StatusTile
          key={account.name}
          label={account.name}
          size="small"
          onClick={() => onSelect(account)}
          {...tileValues(account)}
        />
      ))}
    </TileGrid>
  );
}

function tileValues(account: MoneyAccount): { value: string; sub: string } {
  const yen = (amount: number | null) => (amount === null ? UNKNOWN : formatYen(amount));
  switch (account.kind) {
    case 'bank':
    case 'securities':
      return {
        value: yen(account.balance),
        sub: account.balanceChange === null ? UNKNOWN : formatSignedYen(account.balanceChange),
      };
    case 'card':
      return {
        value: yen(account.withdrawalAmount),
        sub: account.withdrawalOn ? `次回 ${formatMonthDay(account.withdrawalOn)}` : '次回',
      };
  }
}

/** 読み込み中の骨組み。口座の数は読むまで分からないので、1 行分 */
export function AccountGridSkeleton() {
  return (
    <TileGrid columns={COLUMNS}>
      <StatusTileSkeleton size="small" />
      <StatusTileSkeleton size="small" />
      <StatusTileSkeleton size="small" />
    </TileGrid>
  );
}
