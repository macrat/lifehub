import { expenseSchema } from '../../../shared/validation/expenses.ts';
import { jsonResult, type ToolRegistrar } from '../../lib/mcp/types.ts';
import * as service from './service.ts';

export const registerExpenseTools: ToolRegistrar = (server, ctx) => {
  server.registerTool(
    'expenses_get_balance',
    {
      title: '立替残高',
      description:
        '立替の残高を返す。fromUserId のユーザーが toUserId のユーザーに amount 円を支払うと精算される。amount が 0 なら精算済み。',
      inputSchema: {},
    },
    async () => jsonResult(await service.getBalance()),
  );

  server.registerTool(
    'expenses_list',
    {
      title: '立替の履歴',
      description:
        '立替の履歴を新しい順に返す。fromUserId が払った人、toUserId が誰のために払ったか（null は共有 = 折半）。精算（誰かが誰かに払った額）も同じ形で含まれる。',
      inputSchema: {},
    },
    async () => jsonResult(await service.listExpenses()),
  );

  server.registerTool(
    'expenses_add',
    {
      title: '立替の追加',
      description:
        '立替を記録する。fromUserId は払ったユーザーの ID、toUserId は誰のために払ったか（null なら共有 = 折半、ユーザー ID なら全額そのユーザーの負担）、amount は円（正の整数）、spentOn は JST の日付（YYYY-MM-DD）。精算は「払った人を fromUserId、受け取った人を toUserId」にして記録する。',
      inputSchema: expenseSchema,
    },
    async (input) => jsonResult(await service.addExpense(input, ctx.userId)),
  );
};
