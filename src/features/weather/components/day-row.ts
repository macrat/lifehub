import type { DateString } from '../../../../shared/types.ts';

/**
 * 週間天気の行のうち、開いた 3 時間ごとの天気を含まない部分に付ける印（値はその日。`WeatherDayList` が付ける）。
 * 行の中身の並びに頼らずに探せるよう、探す所（`findDayRow`）と印の名前をここで 1 つにする
 */
export const DAY_ROW_ATTRIBUTE = 'data-day-row';

/** 一覧の中の、その日の行（`DAY_ROW_ATTRIBUTE` の付いた部分） */
export function findDayRow(list: HTMLElement, date: DateString): HTMLElement | null {
  return list.querySelector<HTMLElement>(`[${DAY_ROW_ATTRIBUTE}="${date}"]`);
}
