import { z } from 'zod';
import { today } from '../../../shared/date.ts';
import type { Expense } from '../../../shared/expenses.ts';
import { dateStringSchema } from '../../../shared/validation/common.ts';
import { expenseFieldsSchema } from '../../../shared/validation/expenses.ts';
import { formatBalance, formatExpense } from '../../lib/mcp/entries.ts';
import { personInputSchema, resolvePerson } from '../../lib/mcp/people.ts';
import { expectType, refSchema } from '../../lib/mcp/refs.ts';
import {
  ADDITIVE,
  EDITING,
  jsonResult,
  type McpContext,
  type Person,
  type ToolRegistrar,
} from '../../lib/mcp/types.ts';
import * as service from './service.ts';

/**
 * 立替を書く MCP ツール。読むのはタイムライン（`read_timeline` の types=["expense"]）、残高は `get_overview`、
 * 消すのは `delete_entry`。人は名前で指し、To の共有は "shared" と書かせる（API は null）。
 * 書いた後の残高も返す（「いくら払えば精算か」を続けて訊かれることが多く、読み直させない）。
 */

const PAID_FOR =
  '誰のための支払いか: "shared"（2 人の共有 = 折半）か、その人だけの負担ならその人の名前';

const fields = {
  amount: expenseFieldsSchema.shape.amount.describe('金額（円、正の整数）'),
  description: expenseFieldsSchema.shape.description.describe('内容（「スーパー」「電気代」など）'),
  paidBy: personInputSchema.describe('払った人の名前。自分なら "me"'),
  paidFor: z.union([z.literal('shared'), personInputSchema]).describe(PAID_FOR),
  date: dateStringSchema.describe('使った日（JST の YYYY-MM-DD）'),
};

/** paidFor → 立替の To（null は共有） */
function toUserIdOf(ctx: McpContext, people: Person[], paidFor: string): string | null {
  return paidFor === 'shared' ? null : resolvePerson(people, paidFor, ctx.userId);
}

async function withBalance(people: Person[], expense: Expense) {
  const balance = await service.getBalance(people);
  return jsonResult({
    entry: formatExpense(expense, people),
    balance: balance && formatBalance(balance, people),
  });
}

export const registerExpenseTools: ToolRegistrar = (server, ctx) => {
  server.registerTool(
    'add_expense',
    {
      title: '立替を記録する',
      description:
        '2 人の間の立替（どちらかが払ったお金）を記録する。精算（残高の支払い）も同じく記録し、払った人を paidBy、受け取った人を paidFor、内容を「精算」にする。記録した立替と、記録した後の残高（payer が payee に amount 円払えば精算）を返す。',
      inputSchema: {
        amount: fields.amount,
        description: fields.description,
        paidFor: fields.paidFor,
        paidBy: fields.paidBy.optional().describe('払った人の名前。省くと自分'),
        date: fields.date.optional().describe('使った日（JST の YYYY-MM-DD）。今日なら省く'),
      },
      annotations: ADDITIVE,
    },
    async ({ amount, description, paidFor, paidBy, date }) => {
      const people = await ctx.people();
      const expense = await service.addExpense(
        {
          amount,
          description,
          fromUserId: paidBy ? resolvePerson(people, paidBy, ctx.userId) : ctx.userId,
          toUserId: toUserIdOf(ctx, people, paidFor),
          // 今日の日付は LLM が推し量らずに済むよう、サーバーの今日で埋める
          spentOn: date ?? today(),
        },
        ctx.userId,
      );
      return withBalance(people, expense);
    },
  );

  server.registerTool(
    'update_expense',
    {
      title: '立替を直す',
      description:
        '立替を ref で直す。変える項目だけを渡し、省いた項目は今のまま。直した立替と、直した後の残高を返す。',
      inputSchema: {
        ref: refSchema.describe('立替の ref'),
        amount: fields.amount.optional(),
        description: fields.description.optional(),
        paidFor: fields.paidFor.optional(),
        paidBy: fields.paidBy.optional(),
        date: fields.date.optional(),
      },
      annotations: EDITING,
    },
    async ({ ref, amount, description, paidFor, paidBy, date }) => {
      const { id } = expectType(ref, ['expense']);
      const people = await ctx.people();
      const expense = await service.patchExpense(id, {
        amount,
        description,
        fromUserId: paidBy && resolvePerson(people, paidBy, ctx.userId),
        toUserId: paidFor === undefined ? undefined : toUserIdOf(ctx, people, paidFor),
        spentOn: date,
      });
      return withBalance(people, expense);
    },
  );
};
