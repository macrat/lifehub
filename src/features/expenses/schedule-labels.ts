import type { ScheduleFrequency } from '../../../shared/expenses.ts';

/** 立替スケジュールの繰り返しの呼び方（入力の選択肢と一覧の表示） */
export const FREQUENCY_LABELS: Record<ScheduleFrequency, string> = {
  daily: '毎日',
  weekly: '毎週',
  monthly: '毎月',
  yearly: '毎年',
};
