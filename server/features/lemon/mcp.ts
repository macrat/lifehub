import { careLogFieldsSchema } from '../../../shared/validation/lemon.ts';
import { formatCareLog } from '../../lib/mcp/entries.ts';
import { expectType, refSchema } from '../../lib/mcp/refs.ts';
import { instantInputSchema } from '../../lib/mcp/time.ts';
import { ADDITIVE, EDITING, jsonResult, type ToolRegistrar } from '../../lib/mcp/types.ts';
import * as service from './service.ts';

/**
 * レモンの木の世話を書く MCP ツール。状況は `get_overview`、記録を読むのは `read_timeline` の types=["lemon"]、
 * 消すのは `delete_entry`。
 */

const CARE_TYPES_HELP =
  'やったこと・気づいたことの配列: mist=葉水, water=水やり, fertilize=施肥, bloom=開花, drop=落果, harvest=収穫。1 回にやったことはまとめて 1 件にする（葉水と水やりなら ["mist", "water"]）。空の配列にすると note だけの記録（メモ）になる';

const fields = {
  careTypes: careLogFieldsSchema.shape.careTypes.describe(CARE_TYPES_HELP),
  at: instantInputSchema.describe('やった日時（"2030-01-07T09:00"、JST）'),
  note: careLogFieldsSchema.shape.note.describe('メモ（木の様子など）'),
};

export const registerLemonTools: ToolRegistrar = (server, ctx) => {
  server.registerTool(
    'log_lemon_care',
    {
      title: 'レモンの世話を記録する',
      description:
        '家のレモンの木（1 本）の世話（葉水・水やり・施肥）や、木の様子（開花・落果・収穫）を 1 件記録する。木と関係の無い一言は add_memo。記録した内容（ref 付き）を返す。',
      inputSchema: {
        careTypes: fields.careTypes,
        at: fields.at.optional().describe('やった日時（"2030-01-07T09:00"、JST）。今なら省く'),
        note: fields.note.optional(),
      },
      annotations: ADDITIVE,
    },
    async ({ careTypes, at, note }) => {
      // 今の日時は LLM が推し量らずに済むよう、サーバーの今で埋める
      const [log, people] = await Promise.all([
        service.logCare(
          { careTypes, doneAt: at ?? new Date(), note: note ?? null },
          { userId: ctx.userId },
        ),
        ctx.people(),
      ]);
      return jsonResult(formatCareLog(log, people));
    },
  );

  server.registerTool(
    'update_lemon_log',
    {
      title: 'レモンの世話の記録を直す',
      description:
        'レモンの世話の記録を ref で直す。変える項目だけを渡し、省いた項目は今のまま（careTypes は丸ごと置き換える）。直した記録を返す。',
      inputSchema: {
        ref: refSchema.describe('レモンの世話の記録の ref'),
        careTypes: fields.careTypes.optional(),
        at: fields.at.optional(),
        note: fields.note.optional(),
      },
      annotations: EDITING,
    },
    async ({ ref, careTypes, at, note }) => {
      const { id } = expectType(ref, ['lemon']);
      const [log, people] = await Promise.all([
        service.patchLog(id, { careTypes, doneAt: at, note }),
        ctx.people(),
      ]);
      return jsonResult(formatCareLog(log, people));
    },
  );
};
