import { z } from 'zod';
import { cursorShape, idParamSchema, withId } from '../../../shared/validation/common.ts';
import {
  createExpenseRequestSchema,
  createExpenseScheduleRequestSchema,
  expenseScheduleSchema,
  expenseSchema,
  moneyListQuerySchema,
  moneyRulesSchema,
} from '../../../shared/validation/money.ts';
import { procedure, router } from '../../lib/trpc.ts';
import * as service from './service.ts';

/**
 * お金の画面の API。画面から書けるのは、手で入れる立替・立替スケジュール・取り込みルール（並び全体の置き換え）。
 * 口座の値と取り込んだ入出金は Money Forward から取り込むもので、画面からは書かない
 */
export const moneyRouter = router({
  /** お金の画面の一覧の 1 ページ（立替と取り込んだ入出金が 1 本に並ぶ） */
  list: procedure.input(moneyListQuerySchema).query(({ input }) => service.listRecords(input)),
  /** 精算の元になる当事者ごとの合計 */
  totals: procedure.query(() => service.getTotals()),
  create: procedure
    .input(createExpenseRequestSchema)
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      await service.addExpense(input, ctx.userId, id);
    }),
  update: procedure
    .input(withId(expenseSchema))
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      await service.updateExpense(id, input, ctx.userId);
    }),
  delete: procedure.input(idParamSchema).mutation(async ({ ctx, input }) => {
    await service.deleteExpense(input.id, ctx.userId);
  }),
  /** 立替スケジュール（作った順）。日が来たら、この内容の立替を記録する */
  schedules: procedure.query(() => service.listExpenseSchedules()),
  createSchedule: procedure
    .input(createExpenseScheduleRequestSchema)
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      await service.addExpenseSchedule(input, ctx.userId, id);
    }),
  updateSchedule: procedure
    .input(withId(expenseScheduleSchema))
    .mutation(async ({ input: { id, ...input } }) => {
      await service.updateExpenseSchedule(id, input);
    }),
  deleteSchedule: procedure.input(idParamSchema).mutation(async ({ input }) => {
    await service.deleteExpenseSchedule(input.id);
  }),
  accounts: procedure.query(() => service.listAccounts()),
  /** 口座の値の推移の 1 ページ（3 か月。before を省けば最新） */
  balances: procedure
    .input(z.object(cursorShape))
    .query(({ input }) => service.getBalancePage(input.before)),
  rules: procedure.query(() => service.listRules()),
  saveRules: procedure.input(moneyRulesSchema).mutation(async ({ ctx, input }) => {
    await service.saveRules(input, ctx.userId);
  }),
});
