import { moneyRulesSchema } from '../../../shared/validation/money.ts';
import { procedure, router, userProcedure } from '../../lib/trpc.ts';
import * as service from './service.ts';

/**
 * 口座と入出金は Money Forward から取り込むもので、画面からは書かない（一覧は立替と 1 本に並べた `expenses.list`）。
 * 書けるのは入出金の読み替えのルールだけで、並び全体を置き換える
 */
export const moneyRouter = router({
  accounts: procedure.query(() => service.listAccounts()),
  rules: procedure.query(() => service.listRules()),
  saveRules: userProcedure.input(moneyRulesSchema).mutation(async ({ ctx, input }) => {
    await service.saveRules(input, ctx.userId);
  }),
});
