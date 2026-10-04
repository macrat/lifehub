import { z } from 'zod';

/** 年月（YYYY-MM） */
const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, '年月は YYYY-MM 形式で指定してください');

/**
 * 一度に読める月の数。カレンダーが一度に出す月（面の前後のページ・リストで広げた月・選択ダイアログの月）は
 * これより十分少ない。上限は、1 回の要求で何十年分も展開させないためだけにある。
 */
const MAX_MONTHS = 120;

/**
 * カレンダーの月ごとの中身の取得（`calendar.get`）。同じ時点に要る月をまとめて 1 回で頼む（並びも重複も問わない）
 */
export const calendarQuerySchema = z.object({
  months: z.array(monthSchema).min(1).max(MAX_MONTHS),
});
