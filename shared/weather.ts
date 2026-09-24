import type { DateString } from './types.ts';

/**
 * 天気アイコンの部品。気象庁の予報に出る天気を、アイコンで見分ける単位に分けたもの。
 * snow は「雨か雪」「みぞれ」も含む。thunder は雷（雷雨）、fog は霧。
 */
export type WeatherSymbol = 'sun' | 'cloud' | 'rain' | 'snow' | 'thunder' | 'fog';

/**
 * 1 日の天気のアイコン。気象庁の予報のアイコンと同じく、天気が変わる日は 2 つの部品を並べる。
 * change は変わり方で、sometimes は「時々」「一時」（`/` で区切る）、later は「後」「から」（`→` で区切る）。
 */
export type WeatherIcon =
  | { symbol: WeatherSymbol }
  | { symbol: WeatherSymbol; change: 'sometimes' | 'later'; next: WeatherSymbol };

/**
 * 1 日の天気。label は気象庁の天気の名前（「晴時々曇」など）で、アイコンの説明に出す。
 * tempMax は最高気温（℃）で、予報に無かった日は null。
 */
export type DailyWeather = {
  date: DateString;
  icon: WeatherIcon;
  label: string;
  tempMax: number | null;
};

/**
 * 3 時間ごとの天気のうち、同じ天気が続く 1 区間。日表示の時刻の左に、変わり目のアイコンと次の変わり目までの線で出す。
 * 気象庁の区間は 0 時から 3 時間ごとに区切られていて日をまたがないので、区間はどれも 1 日の中に収まる
 * （日をまたいで同じ天気が続いても日ごとに分かれ、どの日も最初の区間の頭にアイコンが出る）。
 * startMin / endMin は date の 0:00 からの分で、endMin は含まない（最大 1440）。
 * label は気象庁の天気の名前（「くもり」など）で、アイコンの説明に出す。
 */
export type HourlyWeather = {
  date: DateString;
  startMin: number;
  endMin: number;
  symbol: WeatherSymbol;
  label: string;
};

/** 期間の天気（`GET /api/calendar` の `weather`）。日ごとの天気と 3 時間ごとの天気 */
export type WeatherInRange = { daily: DailyWeather[]; hourly: HourlyWeather[] };
