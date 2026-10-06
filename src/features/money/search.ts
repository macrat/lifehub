import { z } from 'zod';

/**
 * 残高の推移の画面の検索パラメータ。出す口座の名前（`MoneyAccount` の name）の並び（`?accounts=A&accounts=B`）。
 * お金の画面の口座のタイルから開くと、押したタイルの口座だけが入る。読めない値は「どれも選んでいない」にする。
 * 検索パラメータは URLSearchParams のまま読む（`src/main.tsx` の parseSearch）ので、1 つだけなら配列ではなく文字列で届く
 */
export const balanceSearchSchema = z.object({
  accounts: z.union([z.array(z.string()), z.string().transform((name) => [name])]).catch([]),
});
