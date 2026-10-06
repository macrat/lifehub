import { idParamSchema, withId } from '../../../shared/validation/common.ts';
import {
  createExpenseRequestSchema,
  expenseListQuerySchema,
  expenseSchema,
} from '../../../shared/validation/expenses.ts';
import { procedure, router, userProcedure } from '../../lib/trpc.ts';
import * as service from './service.ts';

export const expensesRouter = router({
  /** お金の画面の一覧（立替と取り込んだ入出金を 1 本に並べた 1 ページ） */
  list: procedure
    .input(expenseListQuerySchema)
    .query(({ input }) => service.listMoneyEntries(input)),
  totals: procedure.query(() => service.getTotals()),
  create: userProcedure
    .input(createExpenseRequestSchema)
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      await service.addExpense(input, ctx.userId, id);
    }),
  update: userProcedure
    .input(withId(expenseSchema))
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      await service.updateExpense(id, input, ctx.userId);
    }),
  delete: userProcedure.input(idParamSchema).mutation(async ({ ctx, input }) => {
    await service.deleteExpense(input.id, ctx.userId);
  }),
});
