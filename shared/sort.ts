/**
 * 並べ替えのキーを符号位置で比べる（localeCompare を使わない）。ICU の照合は記号の重みが弱く、
 * 時刻の無いタスクの番兵 '~' が ISO 日時より前に来てしまう。並びはサーバーとクライアントで
 * 同じでなければならず、ロケールに左右されてもいけない。
 */
export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
