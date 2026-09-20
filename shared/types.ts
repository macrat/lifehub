declare const dateBrand: unique symbol;

/**
 * JST の日付（YYYY-MM-DD）。カレンダーの placementDate や期間指定に使う。
 * 検証済みの文字列にだけ付く印（brand）。作れるのは shared/date.ts の変換関数と dateStringSchema だけで、
 * `as DateString` で無検査に作らない。
 */
export type DateString = string & { readonly [dateBrand]: true };
