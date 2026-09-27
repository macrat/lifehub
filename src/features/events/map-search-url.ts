/**
 * 場所の文字列を地図の検索で開く URL。iOS では Apple のマップ、それ以外では Google マップを開く
 * （iOS では maps.apple.com がマップのアプリで開く）。
 * 住所か店名かは入力した人しか知らないので、座標や地物の ID ではなく文字列のまま検索に渡す。
 */
export function mapSearchUrl(location: string, ios: boolean): string {
  const query = encodeURIComponent(location);
  return ios
    ? `https://maps.apple.com/search?query=${query}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`;
}
