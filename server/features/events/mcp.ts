import { dateRangeQuerySchema, uuidSchema } from '../../../shared/validation/common.ts';
import {
  completeEventSchema,
  createEventSchema,
  deleteEventSchema,
  updateEventSchema,
} from '../../../shared/validation/events.ts';
import { jsonResult, type ToolRegistrar, textResult } from '../../lib/mcp/types.ts';
import * as service from './service.ts';

const FIELDS_HELP = [
  'kind は "event"（予定）か "task"（タスク）。',
  '日時は ISO 8601（タイムゾーン付き）。予定は startsAt と endsAt が必須。タスクはどちらも任意で、endsAt が期限。',
  '終日（予定・タスクとも）は allDay=true にし、endsAt には終了日・期限日（含む）の任意の時刻を指定する。',
  'participantIds は参加者のユーザー ID（1 人以上。users_list で調べる）。',
  'remindStartMinutes / remindEndMinutes は開始／終了（期限）の何分前に通知するか（0/5/10/15/30/60/120/1440、null なら通知なし）。終日では各参加者が設定した時刻に、0 なら当日、それ以外は日に切り上げた日数だけ前の日に通知する。',
  'rrule は RFC 5545 の RRULE 文字列（DTSTART なし、例: "FREQ=WEEKLY;BYDAY=MO"）。UNTIL は JST の壁時計（例: UNTIL=20261231T235959）。null なら単発。',
].join(' ');

const SCOPE_HELP =
  '繰り返しでは scope を指定する: all=すべての回（既定）、this=occurrenceStart で指定した回だけ、following=その回以降すべて（元を打ち切り新しい繰り返しを作る）。';

export const registerEventTools: ToolRegistrar = (server, ctx) => {
  server.registerTool(
    'events_list',
    {
      title: '予定・タスクの一覧',
      description:
        '指定した期間（JST の日付、両端を含む）の予定とタスクを、カレンダー画面と同じ並び（placementDate 順）で返す。kind が "event" なら予定（複数日は日ごとに 1 件、dayIndex / dayCount）、"task" ならタスク。未完了で開始日時が過去または未設定のタスクは今日の位置に繰り越され、繰り返しタスクは未完了の直近 2 回だけが並ぶ。繰り返しは回ごとに展開され、各項目の id は繰り返し元の ID、occurrenceStart はその回を指す基準日時（更新・削除・完了で回を指定するのに使う。単発は null）。',
      inputSchema: dateRangeQuerySchema,
    },
    async (range) => jsonResult(await service.listItems(range)),
  );

  server.registerTool(
    'events_create',
    {
      title: '予定・タスクの作成',
      description: `予定またはタスクを作成する。${FIELDS_HELP}`,
      inputSchema: createEventSchema,
    },
    async (input) => jsonResult(await service.createEvent(input, ctx.userId)),
  );

  server.registerTool(
    'events_update',
    {
      title: '予定・タスクの更新',
      description: `予定またはタスクを更新する（全項目を指定する。kind は変更できない）。${SCOPE_HELP} ${FIELDS_HELP}`,
      inputSchema: updateEventSchema.safeExtend({ id: uuidSchema }),
    },
    async ({ id, ...input }) => jsonResult(await service.updateEvent(id, input, ctx.userId)),
  );

  server.registerTool(
    'events_delete',
    {
      title: '予定・タスクの削除',
      description: `予定またはタスクを削除する。${SCOPE_HELP}`,
      inputSchema: deleteEventSchema.safeExtend({ id: uuidSchema }),
    },
    async ({ id, ...input }) => {
      await service.deleteEvent(id, input, ctx.userId);
      return textResult('削除しました');
    },
  );

  server.registerTool(
    'events_complete',
    {
      title: 'タスクの完了',
      description:
        'タスクを完了にする。繰り返しでは occurrenceStart で回を指定する（events_list の値）。予定には使えない。',
      inputSchema: completeEventSchema.safeExtend({ id: uuidSchema }),
    },
    async ({ id, ...input }) => {
      await service.completeEvent(id, input, ctx.userId);
      return textResult('完了にしました');
    },
  );

  server.registerTool(
    'events_uncomplete',
    {
      title: 'タスクの完了取り消し',
      description: 'タスクの完了を取り消す。繰り返しでは occurrenceStart で回を指定する。',
      inputSchema: completeEventSchema.safeExtend({ id: uuidSchema }),
    },
    async ({ id, ...input }) => {
      await service.uncompleteEvent(id, input, ctx.userId);
      return textResult('完了を取り消しました');
    },
  );
};
