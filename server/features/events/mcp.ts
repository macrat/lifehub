import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  type CreateEventInput,
  type EventPatch,
  eventFieldTypes,
} from '../../../shared/validation/events.ts';
import { ValidationError } from '../../lib/errors.ts';
import { formatEvent } from '../../lib/mcp/entries.ts';
import { personInputSchema, resolvePerson } from '../../lib/mcp/people.ts';
import {
  expectType,
  occurrenceTargetOf,
  refSchema,
  scopeSchema,
  toRef,
} from '../../lib/mcp/refs.ts';
import { instantOf, type When, whenInputSchema } from '../../lib/mcp/time.ts';
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
 * 予定・タスクを書く MCP ツール。読むのはタイムライン（`read_timeline`）、消すのは `delete_entry`。
 *
 * 項目は LLM に合わせて API と形を変える: 日時は日付（終日）か JST の日時の 1 つの文字列で受け、終日かどうかは
 * その形から決める（allDay の旗を別に持たせると、旗と日時の食い違いが起きる）。タスクの期限は `due`、
 * 予定の終了は `end` と名前で分ける（API はどちらも endsAt）。人は名前で指す。
 */

const WHEN_FORMAT = '時刻ありは "2030-01-07T09:00"（JST）、終日は日付 "2030-01-07"';

const fields = {
  title: eventFieldTypes.title.describe('タイトル'),
  participants: z
    .array(personInputSchema)
    .min(1)
    .describe('参加者の名前（get_overview の users）。自分なら "me"'),
  location: eventFieldTypes.location.describe('場所'),
  note: eventFieldTypes.note.describe('メモ'),
  repeat: eventFieldTypes.rrule.describe(
    '繰り返し。RFC 5545 の RRULE（DTSTART なし）。例: 毎週月曜 "FREQ=WEEKLY;BYDAY=MO"、毎月末 "FREQ=MONTHLY;BYMONTHDAY=-1"、年末まで毎日 "FREQ=DAILY;UNTIL=20261231T235959"（UNTIL は JST）',
  ),
  remind: (what: string) =>
    eventFieldTypes.remindStartMinutes.describe(
      `${what}の何分前に通知するか（0/5/10/15/30/60/120/1440）。終日では 0（当日）か 1440（前日）だけで、各自の設定した時刻に届く`,
    ),
};

/** 日付か日時の組から、終日かどうかを決める。日付と日時が混ざっていれば、揃えるよう文で返す */
function allDayOf(...whens: (When | null | undefined)[]): boolean | undefined {
  const given = whens.filter((w): w is When => w != null);
  if (given.length === 0) return undefined;
  const allDay = given[0]?.date !== undefined;
  if (given.some((w) => (w.date !== undefined) !== allDay)) {
    throw new ValidationError(
      '開始と終了（期限）は、どちらも日付（終日）か、どちらも日時にしてください',
    );
  }
  return allDay;
}

/** 参加者の名前 → ID。省けば自分だけ */
function participantIdsOf(ctx: McpContext, people: Person[], names: string[] | undefined) {
  if (!names) return [ctx.userId];
  return [...new Set(names.map((name) => resolvePerson(people, name, ctx.userId)))];
}

/** 予定・タスクで同じ項目（省いた項目は既定: 参加者は自分だけ、ほかは無し） */
type CommonInput = {
  title: string;
  participants?: string[] | undefined;
  location?: string | null | undefined;
  note?: string | null | undefined;
  repeat?: string | null | undefined;
  remindBeforeStart?: CreateEventInput['remindStartMinutes'] | undefined;
};

async function create(
  ctx: McpContext,
  input: CommonInput,
  values: Pick<CreateEventInput, 'kind' | 'allDay' | 'startsAt' | 'endsAt' | 'remindEndMinutes'>,
) {
  const people = await ctx.people();
  const created = await service.createEvent(
    {
      ...values,
      title: input.title,
      participantIds: participantIdsOf(ctx, people, input.participants),
      location: input.location ?? null,
      note: input.note ?? null,
      rrule: input.repeat ?? null,
      remindStartMinutes: input.remindBeforeStart ?? null,
    },
    ctx.userId,
  );
  return jsonResult(formatEvent(created, people));
}

function registerAdd(server: McpServer, ctx: McpContext) {
  server.registerTool(
    'add_event',
    {
      title: '予定を入れる',
      description: `日時の決まった予定（出来事）を入れる。やるべきこと（期限や完了のあるもの）は add_task。start と end は ${WHEN_FORMAT}。終日なら end は最終日（その日を含む）。作った予定（ref 付き）を返す。`,
      inputSchema: {
        title: fields.title,
        start: whenInputSchema.describe(`開始。${WHEN_FORMAT}`),
        end: whenInputSchema.describe('終了。start と同じ形（終日なら最終日の日付）'),
        participants: fields.participants.optional().describe('参加者の名前。省くと自分だけ'),
        location: fields.location.optional(),
        note: fields.note.optional(),
        repeat: fields.repeat.optional(),
        remindBeforeStart: fields.remind('開始').optional(),
        remindBeforeEnd: fields.remind('終了').optional(),
      },
      annotations: ADDITIVE,
    },
    async (input) =>
      create(ctx, input, {
        kind: 'event',
        allDay: allDayOf(input.start, input.end) ?? false,
        startsAt: instantOf(input.start),
        endsAt: instantOf(input.end),
        remindEndMinutes: input.remindBeforeEnd ?? null,
      }),
  );

  server.registerTool(
    'add_task',
    {
      title: 'タスクを足す',
      description: `やるべきことを足す。完了にできる（set_task_done）。日時の決まった出来事（完了の無いもの）は add_event。due（期限）と start（この日時から取りかかる）はどちらも任意で、${WHEN_FORMAT}。日時の無いタスクは完了まで毎日タイムラインの今日に出る。作ったタスク（ref 付き）を返す。`,
      inputSchema: {
        title: fields.title,
        due: whenInputSchema.optional().describe(`期限。${WHEN_FORMAT}`),
        start: whenInputSchema.optional().describe('取りかかる日時。due と同じ形'),
        participants: fields.participants.optional().describe('担当者の名前。省くと自分だけ'),
        location: fields.location.optional(),
        note: fields.note.optional(),
        repeat: fields.repeat
          .optional()
          .describe(`${fields.repeat.description}。due か start が要る`),
        remindBeforeStart: fields.remind('開始').optional(),
        remindBeforeDue: fields.remind('期限').optional(),
      },
      annotations: ADDITIVE,
    },
    async (input) =>
      create(ctx, input, {
        kind: 'task',
        allDay: allDayOf(input.start, input.due) ?? false,
        startsAt: input.start ? instantOf(input.start) : null,
        endsAt: input.due ? instantOf(input.due) : null,
        remindEndMinutes: input.remindBeforeDue ?? null,
      }),
  );
}

const updateInput = {
  ref: refSchema.describe('予定かタスクの ref'),
  scope: scopeSchema,
  title: fields.title.optional(),
  start: whenInputSchema.nullable().optional().describe(`開始。${WHEN_FORMAT}`),
  end: whenInputSchema.optional().describe('予定の終了。start と同じ形'),
  due: whenInputSchema.nullable().optional().describe('タスクの期限。start と同じ形'),
  participants: fields.participants.optional(),
  location: fields.location.optional(),
  note: fields.note.optional(),
  repeat: fields.repeat.optional(),
  remindBeforeStart: fields.remind('開始').optional(),
  remindBeforeEnd: fields.remind('予定の終了').optional(),
  remindBeforeDue: fields.remind('タスクの期限').optional(),
};

/** 予定には end、タスクには due。取り違えは文で返す（黙って読み替えると、どちらのつもりか分からない） */
const END_FIELDS = {
  event: {
    label: '予定',
    own: 'end',
    remind: 'remindBeforeEnd',
    other: ['due', 'remindBeforeDue'],
  },
  task: {
    label: 'タスク',
    own: 'due',
    remind: 'remindBeforeDue',
    other: ['end', 'remindBeforeEnd'],
  },
} as const;

function endOf(kind: 'event' | 'task', input: z.output<z.ZodObject<typeof updateInput>>) {
  const { label, own, remind, other } = END_FIELDS[kind];
  const misused = other.filter((key) => input[key] !== undefined);
  if (misused.length > 0) {
    throw new ValidationError(
      `${label}には ${misused.join('・')} ではなく ${own} を使ってください`,
    );
  }
  return { endsAt: input[own], remind: input[remind] };
}

/** 部分更新の日時: 省けば（undefined）今のまま、null は消す */
function instantPatch(when: When | null | undefined): Date | null | undefined {
  return when && instantOf(when);
}

function registerUpdate(server: McpServer, ctx: McpContext) {
  server.registerTool(
    'update_event',
    {
      title: '予定・タスクを変える',
      description:
        '予定かタスクを ref で変える。変える項目だけを渡し、省いた項目は今のまま（null を渡すと消す）。予定の start だけを渡すと、長さを保ったまま動かす。予定の終了は end、タスクの期限は due。終日と時刻ありを切り替えるには、開始と終了（期限）を両方渡す。繰り返しの回（ref に @ を含む）は scope で範囲を選ぶ。変えた後の予定・タスク（scope が this ならその回）を返す。',
      inputSchema: updateInput,
      annotations: EDITING,
    },
    async (input) => {
      const ref = expectType(input.ref, ['event', 'task']);
      const target = occurrenceTargetOf(ref, input.scope);
      const { endsAt, remind } = endOf(ref.type, input);
      const people = await ctx.people();
      const patch: EventPatch = {
        title: input.title,
        allDay: allDayOf(input.start, endsAt),
        startsAt: instantPatch(input.start),
        endsAt: instantPatch(endsAt),
        participantIds: input.participants && participantIdsOf(ctx, people, input.participants),
        location: input.location,
        note: input.note,
        rrule: input.repeat,
        remindStartMinutes: input.remindBeforeStart,
        remindEndMinutes: remind,
      };
      const updated = await service.patchEvent(ref.id, target, patch, ctx.userId);
      return jsonResult(formatEvent(updated, people));
    },
  );

  server.registerTool(
    'set_task_done',
    {
      title: 'タスクを完了にする',
      description:
        'タスクを ref で完了にする（done=false で完了を取り消す）。繰り返しのタスクは、read_timeline が返した回の ref（@ を含む）が必須で、その回だけが完了になる（繰り返し全体の ref は渡せない）。',
      inputSchema: {
        ref: refSchema.describe('タスクの ref。繰り返しのタスクは回の ref（@ を含む）'),
        done: z.boolean().default(true).describe('true で完了、false で未完了に戻す'),
      },
      annotations: EDITING,
    },
    async ({ ref: input, done }) => {
      const ref = expectType(input, ['task'], '予定は完了にできません。');
      const target = { occurrenceStart: ref.occurrenceStart ?? undefined };
      if (done) await service.completeEvent(ref.id, target, ctx.userId);
      else await service.uncompleteEvent(ref.id, target, ctx.userId);
      return jsonResult({ ref: toRef(ref.type, ref.id, ref.occurrenceStart), done });
    },
  );
}

export const registerEventTools: ToolRegistrar = (server, ctx) => {
  registerAdd(server, ctx);
  registerUpdate(server, ctx);
};
