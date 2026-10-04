/**
 * 並べ替えのキーを符号位置で比べる（localeCompare を使わない）。ICU の照合は記号の重みが弱く、
 * 番兵（終日の項目の '' や '!'。`shared/calendar.ts` の `sortKey`）と ISO 日時の順が崩れる。並びはサーバーとクライアントで
 * 同じでなければならず、ロケールに左右されてもいけない。
 */
export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
