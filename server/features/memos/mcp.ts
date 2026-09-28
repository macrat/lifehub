import { memoSchema } from '../../../shared/validation/memos.ts';
import { formatMemo } from '../../lib/mcp/entries.ts';
import { expectType, refSchema } from '../../lib/mcp/refs.ts';
import { ADDITIVE, EDITING, jsonResult, type ToolRegistrar } from '../../lib/mcp/types.ts';
import * as service from './service.ts';

/**
 * メモを書く MCP ツール。読むのは `read_timeline`（types=["memo"]）、消すのは `delete_entry`。
 * メモは書いた人の言葉なので、直す・消すは書いた本人だけ（service が確かめる）。
 */

const body = memoSchema.shape.body.describe('本文（500 文字まで、プレーンテキスト）');

export const registerMemoTools: ToolRegistrar = (server, ctx) => {
  server.registerTool(
    'add_memo',
    {
      title: 'メモを書く',
      description:
        '家のことで思いついた一言を、今の日時でタイムラインに書き留める（X に投稿するような短いメモ）。予定やタスクにするものは add_event / add_task、レモンの木のことは log_lemon_care。書いたメモ（ref 付き）を返す。',
      inputSchema: { body },
      annotations: ADDITIVE,
    },
    async (input) => {
      const memo = await service.addMemo(input, ctx.userId);
      return jsonResult(formatMemo(memo, await ctx.people()));
    },
  );

  server.registerTool(
    'update_memo',
    {
      title: 'メモを直す',
      description:
        'メモの本文を ref で置き換える。書いた日時は変わらない。書いた本人のメモしか直せない。直したメモを返す。',
      inputSchema: { ref: refSchema.describe('メモの ref'), body },
      annotations: EDITING,
    },
    async ({ ref, body }) => {
      const { id } = expectType(ref, ['memo'], '');
      const memo = await service.updateMemo(id, { body }, ctx.userId);
      return jsonResult(formatMemo(memo, await ctx.people()));
    },
  );
};
