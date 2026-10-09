/**
 * 円の書き方。円記号（半角の「¥」）を先頭に置き、符号はその後ろに付ける（「¥1,200」「¥-3,200」「¥+300,000」）。
 * WHY 符号を円記号の後ろに: 一覧で金額の頭が円記号に揃い、符号は数字に付いて読める。
 * WHY NOT Intl の通貨の書式（style: 'currency'）: どのロケールも負号を通貨記号の前に置く（en-JP は「-¥3,200」）か、
 * 円記号を全角にする・区切りが違うなどで、この並びを出せない。桁区切りと符号だけを Intl に任せ、円記号は自分で付ける。
 */
const SYMBOL = '¥';
const grouping = new Intl.NumberFormat('en-JP', { maximumFractionDigits: 0 });

/** 入金に + を付ける（0 には付けない） */
const signed = new Intl.NumberFormat('en-JP', {
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
});

/** 金額の表示（「¥1,200」。負なら「¥-1,200」）。精算・一覧・詳細・口座で同じ書き方にする */
export function formatYen(amount: number): string {
  return SYMBOL + grouping.format(amount);
}

/** 円記号を付けない桁区切り（「1,200」）。区切り方は `formatYen` と同じ */
export function formatGrouped(amount: bigint): string {
  return grouping.format(amount);
}

/** 入金と出金のある金額の表示（「¥+300,000」「¥-3,200」）。入出金の一覧・詳細・タイムラインで同じ書き方にする */
export function formatSignedYen(amount: number): string {
  return SYMBOL + formatSignedGrouped(amount);
}

/** 円記号を付けない、符号付きの桁区切り（「+300,000」「-3,200」「0」）。円だと分かる狭い所の増減（口座のタイル）に使う */
export function formatSignedGrouped(amount: number): string {
  return signed.format(amount);
}
