import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { idParamSchema } from '../../../shared/validation/common.ts';
import {
  createExpenseRequestSchema,
  expenseListQuerySchema,
  expenseSchema,
} from '../../../shared/validation/expenses.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validationHook } from '../../lib/validator.ts';
import * as service from './service.ts';

export const expensesRoutes = new Hono<AppEnv>()
  .get('/', zValidator('query', expenseListQuerySchema, validationHook), async (c) =>
    c.json(await service.listExpenses(c.req.valid('query'))),
  )
  .get('/totals', async (c) => c.json(await service.getTotals()))
  .post('/', zValidator('json', createExpenseRequestSchema, validationHook), async (c) => {
    const { id, ...input } = c.req.valid('json');
    await service.addExpense(input, c.get('user').id, id);
    return c.body(null, 204);
  })
  .put(
    '/:id',
    zValidator('param', idParamSchema, validationHook),
    zValidator('json', expenseSchema, validationHook),
    async (c) => {
      await service.updateExpense(c.req.valid('param').id, c.req.valid('json'));
      return c.body(null, 204);
    },
  )
  .delete('/:id', zValidator('param', idParamSchema, validationHook), async (c) => {
    await service.deleteExpense(c.req.valid('param').id);
    return c.body(null, 204);
  });
