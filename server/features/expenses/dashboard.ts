import { defineWidget } from '../../lib/dashboard/types.ts';
import { getBalance } from './service.ts';

/** 立替残高: 「A→B に n 円」。0 なら精算済み */
export const expensesWidget = defineWidget({
  id: 'expenses-balance',
  order: 30,
  load: () => getBalance(),
});
