import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { addDays, type DateRange, diffDays, today } from '../../../shared/date.ts';
import { dateStringSchema } from '../../../shared/validation/common.ts';
import { ValidationError } from '../../lib/errors.ts';
import { type FormattedEntry, formatBalance, formatEntry } from '../../lib/mcp/entries.ts';
import {
  ENTRY_TYPES,
  type EntryType,
  occurrenceTargetOf,
  refSchema,
  scopeSchema,
} from '../../lib/mcp/refs.ts';
import { jstDateTime, weekdayOf } from '../../lib/mcp/time.ts';
import {
  compact,
  EDITING,
  jsonResult,
  type McpContext,
  type Person,
  READ_ONLY,
  type ToolRegistrar,
  textResult,
} from '../../lib/mcp/types.ts';
import * as events from '../events/service.ts';
import * as expenses from '../expenses/service.ts';
import * as lemon from '../lemon/service.ts';
import * as memos from '../memos/service.ts';
import { listDays, type TimelineDay } from './service.ts';

/**
 * タイムラインを中心にした MCP ツール。LifeHub の記録（予定・タスク・立替・レモンの世話・メモ）は、
 * どれも日付の上に並ぶエントリーとして読み（`read_timeline`）、エントリーの ref で書き換える・消す（`delete_entry`）。
 * 種類ごとの書き込み（追加・更新）は各 feature の mcp.ts が持つ。
 */

/** 1 回の read_timeline で返すエントリーの上限。越えた日からは省き、絞り方を添える（LLM の文脈を溢れさせない） */
const MAX_ENTRIES = 200;

/** read_timeline で読める期間の上限（日数） */
const MAX_DAYS = 366;

/** 1 日を LLM に返す形にする。天気は 1 行の要約（詳しくは get_weather） */
function formatDay(day: TimelineDay, entries: FormattedEntry[]) {
  const { weather } = day;
  return compact({
    date: day.date,
    weekday: weekdayOf(day.date),
    holiday: day.holiday || undefined,
    weather:
      weather &&
      compact({
        summary: weather.label,
        tempMax: weather.tempMax,
        tempMin: weather.tempMin,
        rainChance: weather.pop,
      }),
    entries,
  });
}

/** エントリーの種類 → service が読む記録の種類（予定とタスクは同じ表） */
function sourceTypes(types: EntryType[] | undefined) {
  return types?.map((type) => (type === 'task' ? 'event' : type));
}

/** 期間の日ごとのエントリー。filtered のときは、エントリーの無い日を省く */
async function readDays(
  range: DateRange,
  filter: { q?: string | undefined; types?: EntryType[] | undefined },
  people: Person[],
) {
  const days = await listDays(range, { q: filter.q, types: sourceTypes(filter.types) });
  const filtered = filter.q !== undefined || filter.types !== undefined;
  const result = [];
  let count = 0;
  for (const day of days) {
    const entries = day.entries
      .map((entry) => formatEntry(entry, people))
      .filter((entry) => !filter.types || filter.types.includes(entry.type));
    if (filtered && entries.length === 0) continue;
    if (count + entries.length > MAX_ENTRIES && result.length > 0) {
      return {
        days: result,
        truncated: `エントリーが多いので ${day.date} 以降を省きました。from を ${day.date} にして続きを読むか、q・types で絞ってください`,
      };
    }
    count += entries.length;
    result.push(formatDay(day, entries));
  }
  return { days: result };
}

function registerOverview(server: McpServer, ctx: McpContext) {
  server.registerTool(
    'get_overview',
    {
      title: '今の状況',
      description:
        '会話の最初に呼ぶ。今の日時と今日の日付（JST）、ユーザー（名前と、どれが自分か）、今日と明日のタイムライン（予定・やるべきタスク・記録・天気）、立替の残高（payer が payee に amount 円払えば精算）、レモンの木の世話の状況（項目ごとの最終実施日時と経過日数。一度もしていない項目は lastDoneAt が無い）をまとめて返す。あなたは今日の日付を知らないので、「明日」「来週」などの日付はここの today から数える。人は users の名前で指す。',
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const now = new Date();
      const date = today(now);
      const people = await ctx.people();
      const [timeline, balance, lemonStatus] = await Promise.all([
        readDays({ from: date, to: addDays(date, 1) }, {}, people),
        // 残高はユーザーがちょうど 2 人のときだけ計算できる。計算できなくても他の状況は返す
        expenses.getBalance().catch((error: unknown) => {
          if (error instanceof ValidationError) return null;
          throw error;
        }),
        lemon.getStatus(now),
      ]);
      return jsonResult({
        now: jstDateTime(now),
        today: date,
        weekday: weekdayOf(date),
        users: people.map((p) => ({ name: p.name, id: p.id, isMe: p.id === ctx.userId })),
        days: timeline.days,
        expenseBalance: balance && formatBalance(balance, people),
        lemon: lemonStatus.map(({ careType, lastDoneAt, daysSince }) =>
          compact({ careType, lastDoneAt: lastDoneAt && jstDateTime(lastDoneAt), daysSince }),
        ),
      });
    },
  );
}

function registerReadTimeline(server: McpServer, ctx: McpContext) {
  server.registerTool(
    'read_timeline',
    {
      title: 'タイムラインを読む',
      description: [
        '期間の記録を日ごとに返す（日付順、1 日の中は終日 → 時刻順）。記録（エントリー）の種類は type で分かる: event=予定、task=タスク、expense=立替、lemon=レモンの木の世話、memo=メモ。各日には祝日（holiday）と天気の要約（weather）も付く。',
        '予定は掛かる日すべてに出る（複数日は day が "2/3" のように何日目か）。未完了のタスクは、開始が過ぎたか日時を持たなければ今日に出る（overdue は期限切れ）。完了したタスクは完了した日に出る。',
        '日時は JST。終日の予定・タスクは start / end / due が日付だけ（end と due はその日を含む）。',
        'q で文字（タイトル・メモ・立替の内容・メモの本文など）の部分一致、types で種類を絞れる。絞ると記録の無い日は省く。「前回の歯医者」「先月の立替」のような探し物は、期間を広めに取って q か types で絞る。',
        '各エントリーの ref を update_event・set_task_done・update_expense・update_lemon_log・update_memo・delete_entry に渡す。',
      ].join(' '),
      inputSchema: {
        from: dateStringSchema.optional().describe('最初の日（JST の YYYY-MM-DD）。省くと今日'),
        to: dateStringSchema
          .optional()
          .describe(`最後の日（その日を含む）。省くと from の 6 日後。期間は ${MAX_DAYS} 日まで`),
        q: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe('記録の文字の部分一致（大文字小文字は区別しない）'),
        types: z.array(z.enum(ENTRY_TYPES)).min(1).optional().describe('読む種類。省くとすべて'),
      },
      annotations: READ_ONLY,
    },
    async ({ from: fromInput, to: toInput, q, types }) => {
      const from = fromInput ?? (toInput ? addDays(toInput, -6) : today());
      const to = toInput ?? addDays(from, 6);
      if (from > to) throw new ValidationError('from は to 以前にしてください');
      if (diffDays(from, to) >= MAX_DAYS) {
        throw new ValidationError(`期間は ${MAX_DAYS} 日までです。分けて読んでください`);
      }
      const people = await ctx.people();
      return jsonResult({ from, to, ...(await readDays({ from, to }, { q, types }, people)) });
    },
  );
}

function registerDeleteEntry(server: McpServer, ctx: McpContext) {
  server.registerTool(
    'delete_entry',
    {
      title: 'エントリーを消す',
      description:
        'タイムラインのエントリー（予定・タスク・立替・レモンの世話・メモ）を ref で消す。取り消せないので、消す物が合っているかを確かめてから呼ぶ。繰り返しの予定・タスクの回（ref に @ を含む）は scope で範囲を選ぶ。メモは書いた本人しか消せない。',
      inputSchema: { ref: refSchema, scope: scopeSchema },
      annotations: { ...EDITING, idempotentHint: false },
    },
    async ({ ref, scope }) => {
      switch (ref.type) {
        case 'event':
        case 'task':
          await events.deleteEvent(ref.id, occurrenceTargetOf(ref, scope), ctx.userId);
          break;
        case 'expense':
          await expenses.deleteExpense(ref.id);
          break;
        case 'lemon':
          await lemon.deleteLog(ref.id);
          break;
        case 'memo':
          await memos.deleteMemo(ref.id, ctx.userId);
          break;
      }
      return textResult('消しました');
    },
  );
}

export const registerTimelineTools: ToolRegistrar = (server, ctx) => {
  registerOverview(server, ctx);
  registerReadTimeline(server, ctx);
  registerDeleteEntry(server, ctx);
};
