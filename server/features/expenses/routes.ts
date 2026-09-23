import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { uuidSchema } from '../../../shared/validation/common.ts';
import {
  createExpenseRequestSchema,
  expenseListQuerySchema,
  expenseSchema,
} from '../../../shared/validation/expenses.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validationHook } from '../../lib/validator.ts';
import * as service from './service.ts';

const idParam = z.object({ id: uuidSchema });

export const expensesRoutes = new Hono<AppEnv>()
  .get('/', zValidator('query', expenseListQuerySchema, validationHook), async (c) =>
    c.json(await service.listExpenses(c.req.valid('query'))),
  )
  .get('/totals', async (c) => c.json(await service.getTotals()))
  .post('/', zValidator('json', createExpenseRequestSchema, validationHook), async (c) => {
    const { id, ...input } = c.req.valid('json');
    const expense = await service.addExpense(input, c.get('user').id, id);
    return c.json(expense, 201);
  })
  .put(
    '/:id',
    zValidator('param', idParam, validationHook),
    zValidator('json', expenseSchema, validationHook),
    async (c) => c.json(await service.updateExpense(c.req.valid('param').id, c.req.valid('json'))),
  )
  .delete('/:id', zValidator('param', idParam, validationHook), async (c) => {
    await service.deleteExpense(c.req.valid('param').id);
    return c.body(null, 204);
  });
