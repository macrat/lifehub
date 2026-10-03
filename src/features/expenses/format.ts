/**
 * 円の書き方。円記号は半角の「¥」にする。
 * WHY en-JP: ja-JP の書式（CLDR）は全角の「￥」を出し、字の左右に空白を持つので、一覧で印と金額の間が
 * 空いて見える。en-JP は桁区切りや負号が ja-JP と同じまま、円記号だけが半角になる。
 * WHY NOT 出来た文字列の「￥」を置き換える: 書式の中身を後から直すより、標準の書式をそのまま使うほうが単純
 */
const yen = new Intl.NumberFormat('en-JP', { style: 'currency', currency: 'JPY' });

/** 金額の表示（「¥1,200」）。精算・一覧・詳細で同じ書き方にする */
export function formatYen(amount: number): string {
  return yen.format(amount);
}
