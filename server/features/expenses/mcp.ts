import { today } from '../../../shared/date.ts';
import { dateStringSchema } from '../../../shared/validation/common.ts';
import {
  expenseFieldsSchema,
  expenseListQuerySchema,
  withExpenseRules,
} from '../../../shared/validation/expenses.ts';
import { jsonResult, type ToolRegistrar } from '../../lib/mcp/types.ts';
import * as service from './service.ts';

/**
 * 立替の追加の入力。spentOn は省略でき、省くと今日（JST）になる。
 * WHY: LLM は今日の日付を正確には知らないので、必須にすると推し量った日付が記録される。
 */
const addExpenseInputSchema = withExpenseRules(
  expenseFieldsSchema.extend({ spentOn: dateStringSchema.optional() }),
);

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
        '立替の履歴を新しいほうから 1 ページ分、古い順（items）で返す。nextCursor が null でなければ、それを before に渡すとさらに前のページを返す。fromUserId が払った人、toUserId が誰のために払ったか（null は共有 = 折半）。精算（誰かが誰かに払った額）も同じ形で含まれる。q（内容のキーワード）、min / max（金額）、since / until（使った日、YYYY-MM-DD）、to（"shared" かユーザー ID）、from（ユーザー ID）で絞り込める。',
      inputSchema: expenseListQuerySchema,
    },
    async (input) => jsonResult(await service.listExpenses(input)),
  );

  server.registerTool(
    'expenses_add',
    {
      title: '立替の追加',
      description:
        '立替を記録する。fromUserId は払ったユーザーの ID、toUserId は誰のために払ったか（null なら共有 = 折半、ユーザー ID なら全額そのユーザーの負担）、amount は円（正の整数）、spentOn は JST の日付（YYYY-MM-DD）で、今日のことなら省略する（省略すると今日）。精算は「払った人を fromUserId、受け取った人を toUserId」にして記録する。',
      inputSchema: addExpenseInputSchema,
    },
    async ({ spentOn, ...input }) =>
      jsonResult(await service.addExpense({ ...input, spentOn: spentOn ?? today() }, ctx.userId)),
  );
};
