import { z } from 'zod';
import { today } from '../../../shared/date.ts';
import type { MoneyRecord } from '../../../shared/money.ts';
import { dateStringSchema } from '../../../shared/validation/common.ts';
import { expenseFieldsSchema, SHARED } from '../../../shared/validation/money.ts';
import { formatExpense, formatSettlements } from '../../lib/mcp/entries.ts';
import { personInputSchema, resolvePerson } from '../../lib/mcp/people.ts';
import { expectType, refSchema } from '../../lib/mcp/refs.ts';
import {
  ADDITIVE,
  EDITING,
  jsonResult,
  type McpContext,
  type McpRegistrar,
  type Person,
} from '../../lib/mcp/types.ts';
import * as service from './service.ts';

/**
 * 立替を書く MCP ツール（Money Forward から取り込んだ入出金は読むだけで、直せない）。読むのはタイムライン（`read_timeline` の types=["expense"]）、精算は `get_overview`、
 * 消すのは `delete_entry`。人は名前で指し、共有（共有口座）は "shared" と書かせる（API は null）。
 * 書いた後の精算も返す（「いくら払えば精算か」を続けて訊かれることが多く、読み直させない）。
 */

const PAID_BY = '払った人の名前。自分なら "me"、共有口座から払った（引き出した）なら "shared"';
const PAID_FOR =
  '誰のための支払いか: 共有口座が負担するもの（2 人のための出費など）なら "shared"、その人だけの負担ならその人の名前';

/** 立替の当事者: 共有（共有口座）か人 */
const partyInputSchema = z.union([z.literal(SHARED), personInputSchema]);

const fields = {
  amount: expenseFieldsSchema.shape.amount.describe('金額（円、正の整数）'),
  description: expenseFieldsSchema.shape.description.describe('内容（「スーパー」「電気代」など）'),
  paidBy: partyInputSchema.describe(PAID_BY),
  paidFor: partyInputSchema.describe(PAID_FOR),
  date: dateStringSchema.describe('使った日（JST の YYYY-MM-DD）'),
};

/** paidBy・paidFor → 立替の From・To（null は共有） */
function partyIdOf(ctx: McpContext, people: Person[], party: string): string | null {
  return party === SHARED ? null : resolvePerson(people, party, ctx.userId);
}

async function withSettlements(people: Person[], expense: MoneyRecord) {
  return jsonResult({
    entry: formatExpense(expense, people),
    settlements: formatSettlements(await service.getSettlements(), people),
  });
}

export const registerExpenseTools: McpRegistrar = (server, ctx) => {
  server.registerTool(
    'add_expense',
    {
      title: '立替を記録する',
      description:
        '立替（ユーザーや共有口座が、誰かのために払ったお金）を記録する。払った側（paidBy）に債権、払ってもらった側（paidFor）に債務が生じる。精算（貸し借りを返す支払い）も同じく記録し、払った人を paidBy、受け取った人を paidFor、内容を「精算」にする。記録した立替と、記録した後の精算（payer が payee に amount 円払う移動をすべて行えば帳消し。空なら精算済み）を返す。',
      inputSchema: z.object({
        amount: fields.amount,
        description: fields.description,
        paidFor: fields.paidFor,
        paidBy: fields.paidBy.optional().describe(`${PAID_BY}。省くと自分`),
        date: fields.date.optional().describe('使った日（JST の YYYY-MM-DD）。今日なら省く'),
      }),
      annotations: ADDITIVE,
    },
    async ({ amount, description, paidFor, paidBy, date }) => {
      const people = await ctx.people();
      const expense = await service.addExpense(
        {
          amount,
          description,
          fromUserId: paidBy ? partyIdOf(ctx, people, paidBy) : ctx.userId,
          toUserId: partyIdOf(ctx, people, paidFor),
          // 今日の日付は LLM が推し量らずに済むよう、サーバーの今日で埋める
          occurredOn: date ?? today(),
        },
        ctx.userId,
      );
      return withSettlements(people, expense);
    },
  );

  server.registerTool(
    'update_expense',
    {
      title: '立替を直す',
      description:
        '立替を ref で直す。変える項目だけを渡し、省いた項目は今のまま。直した立替と、直した後の精算を返す。',
      inputSchema: z.object({
        ref: refSchema.describe('立替の ref'),
        amount: fields.amount.optional(),
        description: fields.description.optional(),
        paidFor: fields.paidFor.optional(),
        paidBy: fields.paidBy.optional(),
        date: fields.date.optional(),
      }),
      annotations: EDITING,
    },
    async ({ ref, amount, description, paidFor, paidBy, date }) => {
      const { id } = expectType(ref, ['expense']);
      const people = await ctx.people();
      const expense = await service.patchExpense(
        id,
        {
          amount,
          description,
          fromUserId: paidBy === undefined ? undefined : partyIdOf(ctx, people, paidBy),
          toUserId: paidFor === undefined ? undefined : partyIdOf(ctx, people, paidFor),
          occurredOn: date,
        },
        ctx.userId,
      );
      return withSettlements(people, expense);
    },
  );
};
