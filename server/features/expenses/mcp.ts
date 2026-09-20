import { createExpenseSchema } from '../../../shared/validation/expenses.ts';
import { jsonResult, type ToolRegistrar } from '../../lib/mcp/types.ts';
import * as service from './service.ts';

export const registerExpenseTools: ToolRegistrar = (server, ctx) => {
  server.registerTool(
    'expenses_get_balance',
    {
      title: '立替残高',
      description:
        '立替の残高を返す。fromUserId のユーザーが toUserId のユーザーに amount 円を支払うと精算される。amount が 0 なら精算済み。立替は常に折半で計算する。',
      inputSchema: {},
    },
    async () => jsonResult(await service.getBalance()),
  );

  server.registerTool(
    'expenses_list',
    {
      title: '立替と精算の履歴',
      description: '立替（expenses）と精算（settlements）の履歴を新しい順に返す。',
      inputSchema: {},
    },
    async () => jsonResult(await service.listHistory()),
  );

  server.registerTool(
    'expenses_add',
    {
      title: '立替の追加',
      description:
        '立替を記録する。paidBy は支払ったユーザーの ID、amount は円（正の整数）、spentOn は JST の日付（YYYY-MM-DD）。',
      inputSchema: createExpenseSchema,
    },
    async (input) => jsonResult(await service.addExpense(input, ctx.userId)),
  );

  server.registerTool(
    'expenses_settle',
    {
      title: '精算',
      description:
        '現在の残高をそのまま精算として記録し、残高をゼロに戻す。残高が 0 なら失敗する。',
      inputSchema: {},
    },
    async () => jsonResult(await service.settle(ctx.userId)),
  );
};
