import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { defaultEventEnd } from '../../../shared/calendar.ts';
import {
  type CreateEventInput,
  type EventKind,
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
 * 予定とタスクは画面と同じく 1 つの入力で扱い（`add_event` / `update_event` の kind）、種類を入れ替えられる。
 * WHY 1 つにする: 画面では書きながら種類を切り替えるので、LLM にも同じ操作で同じ結果を返す。
 * 項目は終わりの名前（end / due）と通知の名前以外は同じで、分岐（anyOf）にしなくても平らな入力で足りる。
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

const kindSchema = eventFieldTypes.kind.describe(
  '種類。event は日時の決まった予定（出来事）、task はやるべきこと（期限や完了のあるもの。set_task_done で完了にできる）',
);

/**
 * 予定・タスクの日時と通知の入力。予定・タスクで 1 つのツール（`add_event` / `update_event`）にし、
 * 終わりの名前だけを種類で分ける（予定は end、タスクは due）。
 */
const whenFields = {
  start: whenInputSchema.describe(`開始。${WHEN_FORMAT}`),
  end: whenInputSchema.describe(
    '予定の終了。start と同じ形（終日なら最終日の日付）。予定で省くと開始から 1 時間（終日ならその日 1 日）。タスクには使わない',
  ),
  due: whenInputSchema.describe('タスクの期限。start と同じ形。予定には使わない'),
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

type EndInput = {
  end?: When | null | undefined;
  due?: When | null | undefined;
  remindBeforeEnd?: CreateEventInput['remindEndMinutes'] | undefined;
  remindBeforeDue?: CreateEventInput['remindEndMinutes'] | undefined;
};

/** 種類 kind の終わり（予定は end、タスクは due）とその前の通知。もう一方の名前が渡されていれば文で返す */
function endOf(kind: EventKind, input: EndInput) {
  const { label, own, remind, other } = END_FIELDS[kind];
  const misused = other.filter((key) => input[key] !== undefined);
  if (misused.length > 0) {
    throw new ValidationError(
      `${label}には ${misused.join('・')} ではなく ${own} を使ってください`,
    );
  }
  return { endsAt: input[own], remind: input[remind] };
}

function registerAdd(server: McpServer, ctx: McpContext) {
  server.registerTool(
    'add_event',
    {
      title: '予定・タスクを足す',
      description: `予定（kind: event）かタスク（kind: task）を足す。日時は ${WHEN_FORMAT}。予定は start が必須で、end（終了。終日なら最終日）を省くと開始から 1 時間（終日ならその日 1 日）。タスクは start（この日時から取りかかる）と due（期限）がどちらも任意で、日時の無いタスクは完了まで毎日タイムラインの今日に出る。作った予定・タスク（ref 付き）を返す。`,
      inputSchema: z.object({
        kind: kindSchema,
        title: fields.title,
        start: whenFields.start.optional(),
        end: whenFields.end.optional(),
        due: whenFields.due.optional(),
        participants: fields.participants
          .optional()
          .describe('参加者（担当者）の名前。省くと自分だけ'),
        location: fields.location.optional(),
        note: fields.note.optional(),
        repeat: fields.repeat
          .optional()
          .describe(`${fields.repeat.description}。タスクでは due か start が要る`),
        remindBeforeStart: whenFields.remindBeforeStart,
        remindBeforeEnd: whenFields.remindBeforeEnd,
        remindBeforeDue: whenFields.remindBeforeDue,
      }),
      annotations: ADDITIVE,
    },
    async (input) => {
      const { endsAt: end, remind } = endOf(input.kind, input);
      const allDay = allDayOf(input.start, end) ?? false;
      const startsAt = input.start ? instantOf(input.start) : null;
      let endsAt = end ? instantOf(end) : null;
      if (input.kind === 'event') {
        if (!startsAt) throw new ValidationError('予定には start（開始）を指定してください');
        endsAt ??= defaultEventEnd(allDay, startsAt);
      }
      const people = await ctx.people();
      const created = await service.createEvent(
        {
          kind: input.kind,
          title: input.title,
          allDay,
          startsAt,
          endsAt,
          participantIds: participantIdsOf(ctx, people, input.participants),
          location: input.location ?? null,
          note: input.note ?? null,
          rrule: input.repeat ?? null,
          remindStartMinutes: input.remindBeforeStart ?? null,
          remindEndMinutes: remind ?? null,
        },
        ctx.userId,
      );
      return jsonResult(formatEvent(created, people));
    },
  );
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
        '予定かタスクを ref で変える。変える項目だけを渡し、省いた項目は今のまま（null を渡すと消す）。予定の start だけを渡すと、長さを保ったまま動かす。予定の終了は end、タスクの期限は due。終日と時刻ありを切り替えるには、開始と終了（期限）を両方渡す。kind で予定とタスクを入れ替えられる（引き継ぐ日時は開始だけ: タスクにすると期限は無し、予定にすると開始から 1 時間（終日ならその日 1 日）。end・due を一緒に渡せばそれにする。繰り返しの 1 回だけ（scope が this）は入れ替えられない）。繰り返しの回（ref に @ を含む）は scope で範囲を選ぶ。変えた後の予定・タスク（scope が this ならその回）を返す。',
      inputSchema: z.object({
        ref: refSchema.describe('予定かタスクの ref'),
        scope: scopeSchema,
        kind: kindSchema
          .optional()
          .describe('予定（event）とタスク（task）を入れ替えるときだけ渡す'),
        title: fields.title.optional(),
        start: whenFields.start.nullable().optional(),
        end: whenFields.end.optional(),
        due: whenFields.due.nullable().optional(),
        participants: fields.participants.optional(),
        location: fields.location.optional(),
        note: fields.note.optional(),
        repeat: fields.repeat.optional(),
        remindBeforeStart: whenFields.remindBeforeStart,
        remindBeforeEnd: whenFields.remindBeforeEnd,
        remindBeforeDue: whenFields.remindBeforeDue,
      }),
      annotations: EDITING,
    },
    async (input) => {
      const ref = expectType(input.ref, ['event', 'task']);
      const target = occurrenceTargetOf(ref, input.scope);
      // 終わりの名前は変えた後の種類で決める（タスクを予定にするなら end）
      const { endsAt, remind } = endOf(input.kind ?? ref.type, input);
      const people = await ctx.people();
      const patch: EventPatch = {
        kind: input.kind,
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
      inputSchema: z.object({
        ref: refSchema.describe('タスクの ref。繰り返しのタスクは回の ref（@ を含む）'),
        done: z.boolean().default(true).describe('true で完了、false で未完了に戻す'),
      }),
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
