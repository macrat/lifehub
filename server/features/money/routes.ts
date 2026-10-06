import { z } from 'zod';
import { cursorShape } from '../../../shared/validation/common.ts';
import { moneyRulesSchema } from '../../../shared/validation/money.ts';
import { procedure, router, userProcedure } from '../../lib/trpc.ts';
import * as service from './service.ts';

/**
 * 口座と入出金は Money Forward から取り込むもので、画面からは書かない（一覧は立替と 1 本に並べた `expenses.list`）。
 * 書けるのは入出金の読み替えのルールだけで、並び全体を置き換える
 */
export const moneyRouter = router({
  accounts: procedure.query(() => service.listAccounts()),
  /** 口座の値の推移の 1 ページ（3 か月。before を省けば最新） */
  balances: procedure
    .input(z.object(cursorShape))
    .query(({ input }) => service.getBalancePage(input.before)),
  rules: procedure.query(() => service.listRules()),
  saveRules: userProcedure.input(moneyRulesSchema).mutation(async ({ ctx, input }) => {
    await service.saveRules(input, ctx.userId);
  }),
});
