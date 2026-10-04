declare const dateBrand: unique symbol;

/**
 * JST の日付（YYYY-MM-DD）。カレンダーの placementDate や期間指定に使う。
 * 検証済みの文字列にだけ付く印（brand）。作れるのは shared/date.ts の変換関数と dateStringSchema だけで、
 * `as DateString` で無検査に作らない。
 */
export type DateString = string & { readonly [dateBrand]: true };

/**
 * 履歴（タイムライン・立替・レモンの記録・天気）の 1 ページ。items は古い順。ページは日（JST の暦日）の途中では切らない
 * （同じ日の記録は必ず同じページに入る）。nextCursor はこのページより前があるときに、次に読むページの
 * `before`（このページの最も古い日）。
 * WHY 日で切る: 次の境目を日付 1 つで言えるので、登録日時の精度（DB はマイクロ秒、JSON はミリ秒）に
 * 左右されず、境目の記録が消されても続きを読める（行の ID を境目にすると、消えたときに位置を引けない）。
 */
export type HistoryPage<T> = {
  items: T[];
  nextCursor: DateString | null;
};
