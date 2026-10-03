import { idParamSchema, withId } from '../../../shared/validation/common.ts';
import {
  createExpenseRequestSchema,
  expenseListQuerySchema,
  expenseSchema,
} from '../../../shared/validation/expenses.ts';
import { procedure, router } from '../../lib/trpc.ts';
import * as service from './service.ts';

export const expensesRouter = router({
  list: procedure.input(expenseListQuerySchema).query(({ input }) => service.listExpenses(input)),
  totals: procedure.query(() => service.getTotals()),
  create: procedure
    .input(createExpenseRequestSchema)
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      await service.addExpense(input, (await ctx.user).id, id);
    }),
  update: procedure
    .input(withId(expenseSchema))
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      await service.updateExpense(id, input, (await ctx.user).id);
    }),
  delete: procedure.input(idParamSchema).mutation(async ({ ctx, input }) => {
    await service.deleteExpense(input.id, (await ctx.user).id);
  }),
});
