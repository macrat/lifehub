import { Hono } from 'hono';
import { idParamSchema } from '../../../shared/validation/common.ts';
import {
  createExpenseRequestSchema,
  expenseListQuerySchema,
  expenseSchema,
} from '../../../shared/validation/expenses.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validate } from '../../lib/validator.ts';
import * as service from './service.ts';

export const expensesRoutes = new Hono<AppEnv>()
  .get('/', validate('query', expenseListQuerySchema), async (c) =>
    c.json(await service.listExpenses(c.req.valid('query'))),
  )
  .get('/totals', async (c) => c.json(await service.getTotals()))
  .post('/', validate('json', createExpenseRequestSchema), async (c) => {
    const { id, ...input } = c.req.valid('json');
    await service.addExpense(input, (await c.var.user).id, id);
    return c.body(null, 204);
  })
  .put('/:id', validate('param', idParamSchema), validate('json', expenseSchema), async (c) => {
    await service.updateExpense(c.req.valid('param').id, c.req.valid('json'));
    return c.body(null, 204);
  })
  .delete('/:id', validate('param', idParamSchema), async (c) => {
    await service.deleteExpense(c.req.valid('param').id);
    return c.body(null, 204);
  });
