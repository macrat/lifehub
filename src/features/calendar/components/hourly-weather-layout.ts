/**
 * 日表示の時刻の左に出す 3 時間ごとの天気（`HourlyWeatherColumn`）のアイコンの大きさ（px）。
 * 時刻の字（0.65rem）と同じくらいにして、時刻より目立たせない。
 */
export const HOURLY_ICON_SIZE = 12;

/** 3 時間ごとの天気と、欄の左端とのあいだの余白（px） */
export const HOURLY_WEATHER_INSET = 2;

/**
 * 3 時間ごとの天気のために時刻の欄へ足す幅（px）。左の余白とアイコン。
 * 欄の幅を決める側（`TimelineView`）と中に置く側（`HourlyWeatherColumn`）が同じ寸法を読むよう、部品のファイルではなくここに置く。
 */
export const HOURLY_WEATHER_WIDTH = HOURLY_WEATHER_INSET + HOURLY_ICON_SIZE;
