const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' });

/** 金額の表示（「￥1,200」）。残高・一覧・詳細で同じ書き方にする */
export function formatYen(amount: number): string {
  return yen.format(amount);
}
