import { z } from 'zod';
import { searchArray } from '../../lib/search.ts';

/**
 * 残高の推移の画面の検索パラメータ。出す口座の名前（`MoneyAccount` の name）の並び。
 * お金の画面の口座のタイルから開くと、押したタイルの口座だけが入る。読めない値は「どれも選んでいない」にする。
 */
export const balanceSearchSchema = z.object({
  accounts: searchArray(z.string()).catch([]),
});
