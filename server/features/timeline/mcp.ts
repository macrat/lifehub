import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { addDays, type DateRange, today } from '../../../shared/date.ts';
import { BALANCE_CHANGE_DAYS } from '../../../shared/money.ts';
import {
  type FormattedEntry,
  formatEntry,
  formatMoneyAccount,
  formatSettlements,
  weatherSummary,
} from '../../lib/mcp/entries.ts';
import {
  ENTRY_TYPES,
  type EntryType,
  occurrenceTargetOf,
  refSchema,
  scopeSchema,
} from '../../lib/mcp/refs.ts';
import { dateRangeInput, jstDateTime, weekdayOf } from '../../lib/mcp/time.ts';
import {
  compact,
  EDITING,
  jsonResult,
  type McpContext,
  type McpRegistrar,
  READ_ONLY,
  textResult,
} from '../../lib/mcp/types.ts';
import * as events from '../events/service.ts';
import * as lemon from '../lemon/service.ts';
import * as memos from '../memos/service.ts';
import * as money from '../money/service.ts';
import { type DayEntryType, listDays, type TimelineDay } from './service.ts';

/**
 * タイムラインを中心にした MCP ツール。LifeHub の記録（予定・タスク・立替・レモンの世話・メモ）は、
 * どれも日付の上に並ぶエントリーとして読み（`read_timeline`）、エントリーの ref で書き換える・消す（`delete_entry`）。
 * 種類ごとの書き込み（追加・更新）は各 feature の mcp.ts が持つ。
 */

// ref の種類（ENTRY_TYPES）と、タイムラインが並べる記録の種類（DayEntryType）は同じ物を指す。
// 記録の種類を足したのに ref の種類に足し忘れると、read_timeline で絞れず delete_entry で消せない種類ができるので型で止める
type _SameEntryTypes = Assert<
  [DayEntryType] extends [EntryType] ? ([EntryType] extends [DayEntryType] ? true : false) : false
>;
type Assert<T extends true> = T;

/** 1 回の read_timeline で返すエントリーの上限。越えた日からは省き、絞り方を添える（LLM の文脈を溢れさせない） */
const MAX_ENTRIES = 200;

/** read_timeline の期間: 既定は 7 日、最大 366 日 */
const range = dateRangeInput(7, 366);

/** 1 日を LLM に返す形にする。天気は要約だけ（詳しくは get_weather） */
function formatDay(day: TimelineDay, entries: FormattedEntry[]) {
  return compact({
    date: day.date,
    weekday: weekdayOf(day.date),
    holiday: day.holiday || undefined,
    weather: day.weather && weatherSummary(day.weather),
    entries,
  });
}

/**
 * 期間の日ごとのエントリー。絞り込んだとき（q・types）は、エントリーの無い日を省く。
 * 自分以外のタスクは includeOthersTasks のときだけ出す（`listDays`）
 */
async function readDays(
  ctx: McpContext,
  days: DateRange,
  filter: {
    q?: string | undefined;
    types?: EntryType[] | undefined;
    includeOthersTasks?: boolean | undefined;
  },
) {
  const [people, timeline] = await Promise.all([ctx.people(), listDays(days, filter, ctx.userId)]);
  const filtered = filter.q !== undefined || filter.types !== undefined;
  const result = [];
  let count = 0;
  for (const day of timeline) {
    if (filtered && day.entries.length === 0) continue;
    if (count + day.entries.length > MAX_ENTRIES && result.length > 0) {
      return {
        days: result,
        truncated: `エントリーが多いので ${day.date} 以降を省きました。from を ${day.date} にして続きを読むか、q・types で絞ってください`,
      };
    }
    count += day.entries.length;
    result.push(
      formatDay(
        day,
        day.entries.map((entry) => formatEntry(entry, people)),
      ),
    );
  }
  return { days: result };
}

function registerOverview(server: McpServer, ctx: McpContext) {
  server.registerTool(
    'get_overview',
    {
      title: '今の状況',
      description: [
        '会話の最初に呼ぶ。次をまとめて返す:',
        '今の日時と今日の日付（JST）。',
        'ユーザー（名前と、どれが自分か）。',
        '今日と明日のタイムライン（予定・自分のやるべきタスク・記録・天気。自分以外のタスクは read_timeline の includeOthersTasks で読む）。',
        '立替の精算（payer が payee に amount 円払う移動をすべて行えば帳消し。空なら精算済み。"shared" は共有口座）。',
        'レモンの木の世話の状況（項目ごとの最終実施日時と経過日数。一度もしていない項目は lastDoneAt が無い）。',
        'Money Forward から日に 1 度取り込む口座の今の値（moneyAccounts。金額は円、fetchedAt は取り込んだ日時）。',
        `bank と securities は、balance が残高・評価額、balanceChange が ${BALANCE_CHANGE_DAYS} 日前の値からの増減（増えたら正）。card は、withdrawalAmount が次回の引き落とし額、withdrawalOn がその日。値が無い（読めない・${BALANCE_CHANGE_DAYS} 日前の記録が無い）項目は省く。`,
        'あなたは今日の日付を知らないので、「明日」「来週」などの日付はここの today から数える。人は users の名前で指す。3 時間ごとの天気や週間予報は get_weather で読む。',
      ].join(' '),
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    async () => {
      const now = new Date();
      const date = today(now);
      const [people, timeline, settlements, lemonStatus, moneyAccounts] = await Promise.all([
        ctx.people(),
        readDays(ctx, { from: date, to: addDays(date, 1) }, {}),
        money.getSettlements(),
        lemon.getStatus(now),
        money.listAccounts(),
      ]);
      return jsonResult({
        now: jstDateTime(now),
        today: date,
        weekday: weekdayOf(date),
        users: people.map((p) => ({ name: p.name, id: p.id, isMe: p.id === ctx.userId })),
        days: timeline.days,
        expenseSettlements: formatSettlements(settlements, people),
        lemon: lemonStatus.map(({ careType, lastDoneAt, daysSince }) =>
          compact({ careType, lastDoneAt: lastDoneAt && jstDateTime(lastDoneAt), daysSince }),
        ),
        moneyAccounts: moneyAccounts.map(formatMoneyAccount),
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
        '期間の記録を日ごとに返す。記録（エントリー）の種類は type で分かる: event=予定、task=タスク、expense=お金の記録（手で入れた立替と、Money Forward から取り込んだ口座の入出金。取り込んだものは account（金融機関）を持ち、amount は入金が正・出金が負で、読むだけなので ref を持たない。取り込んだものは paidBy・paidFor があれば「共有」との立替として精算に入っている）、lemon=レモンの木の世話、memo=メモ。各日には祝日（holiday）と天気の要約（weather）も付く。',
        '予定は掛かる日すべてに出る（複数日は day が "2/3" のように何日目か）。未完了のタスクは、開始が過ぎれば今日に出る。完了したタスクは完了した日に出る。',
        'タスクは既定では自分が参加者にいるものだけを返す。ほかの人のタスクも読むには includeOthersTasks を true にする（予定は誰のものでも返す）。',
        '日時は JST。終日の予定・タスクは start / end が日付だけ（end はその日を含む）。',
        'q で文字（タイトル・メモ・立替の内容・メモの本文・入出金の内容など）の部分一致、types で種類を絞れる。絞ると記録の無い日は省く。「前回の歯医者」「先月の立替」のような探し物は、期間を広めに取って q か types で絞る。',
        `一度に返すのは ${MAX_ENTRIES} 件まで。`,
        '各エントリーの ref を update_event・set_task_done・update_expense・update_lemon_log・update_memo・delete_entry に渡す。',
      ].join(' '),
      inputSchema: z.object({
        ...range.shape,
        q: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe('記録の文字の部分一致（大文字小文字は区別しない）'),
        types: z.array(z.enum(ENTRY_TYPES)).min(1).optional().describe('読む種類。省くとすべて'),
        includeOthersTasks: z
          .boolean()
          .optional()
          .describe('自分が参加者にいないタスクも返すか。省くと返さない'),
      }),
      annotations: READ_ONLY,
    },
    async ({ from, to, q, types, includeOthersTasks }) => {
      const period = range.resolve({ from, to });
      return jsonResult({
        ...period,
        ...(await readDays(ctx, period, { q, types, includeOthersTasks })),
      });
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
      inputSchema: z.object({ ref: refSchema, scope: scopeSchema }),
      annotations: { ...EDITING, idempotentHint: false },
    },
    async ({ ref, scope }) => {
      switch (ref.type) {
        case 'event':
        case 'task':
          await events.deleteEvent(ref.id, occurrenceTargetOf(ref, scope), ctx.userId);
          break;
        case 'expense':
          await money.deleteExpense(ref.id, ctx.userId);
          break;
        case 'lemon':
          await lemon.deleteLog(ref.id, ctx.userId);
          break;
        case 'memo':
          await memos.deleteMemo(ref.id, ctx.userId);
          break;
        default: {
          // 種類を増やして消し方を足し忘れたら型エラーにする（何も消さずに「消しました」と返さない）
          const unhandled: never = ref.type;
          throw new Error(`unknown entry type: ${unhandled}`);
        }
      }
      return textResult('消しました');
    },
  );
}

export const registerTimelineTools: McpRegistrar = (server, ctx) => {
  registerOverview(server, ctx);
  registerReadTimeline(server, ctx);
  registerDeleteEntry(server, ctx);
};
