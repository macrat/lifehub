import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { uuidSchema } from '../../../shared/validation/common.ts';
import { expenseSchema } from '../../../shared/validation/expenses.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validationHook } from '../../lib/validator.ts';
import * as service from './service.ts';

const idParam = z.object({ id: uuidSchema });

export const expensesRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await service.listExpenses()))
  .get('/balance', async (c) => c.json(await service.getBalance()))
  .post('/', zValidator('json', expenseSchema, validationHook), async (c) => {
    const expense = await service.addExpense(c.req.valid('json'), c.get('user').id);
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
