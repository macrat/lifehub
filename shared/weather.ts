import type { DateString } from './types.ts';

/** 天気アイコンの種類。気象庁が天気コードをまとめた 4 分類（server/features/weather/telops.ts） */
export type WeatherKind = 'sunny' | 'cloudy' | 'rainy' | 'snowy';

/**
 * 1 日の天気。label は気象庁の天気の名前（「晴時々曇」など）で、アイコンの説明に出す。
 * tempMax は最高気温（℃）で、予報に無かった日は null。
 */
export type DailyWeather = {
  date: DateString;
  kind: WeatherKind;
  label: string;
  tempMax: number | null;
};
