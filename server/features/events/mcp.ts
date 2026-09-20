import { addDays, startOfDate } from '../../../shared/date.ts';
import { dateRangeQuerySchema, uuidSchema } from '../../../shared/validation/common.ts';
import {
  createEventSchema,
  deleteEventSchema,
  updateEventSchema,
} from '../../../shared/validation/events.ts';
import { jsonResult, type ToolRegistrar, textResult } from '../../lib/mcp/types.ts';
import * as service from './service.ts';

const RRULE_HELP =
  'rrule は RFC 5545 の RRULE 文字列（DTSTART なし、例: "FREQ=WEEKLY;BYDAY=MO"）。UNTIL は JST の壁時計（例: UNTIL=20261231T235959）。null なら単発。';

export const registerEventTools: ToolRegistrar = (server, ctx) => {
  server.registerTool(
    'events_list',
    {
      title: '予定の一覧',
      description:
        '指定した期間（JST の日付、両端を含む）の予定の発生を列挙する。繰り返し予定は回ごとに展開され、個別変更・削除が反映される。各項目の id はマスターの ID、occurrenceStart はその回を指す元の開始日時（更新・削除で scope=this/following を使うときに指定する）。',
      inputSchema: dateRangeQuerySchema,
    },
    async ({ from, to }) =>
      jsonResult(
        await service.listOccurrences({ from: startOfDate(from), to: startOfDate(addDays(to, 1)) }),
      ),
  );

  server.registerTool(
    'events_create',
    {
      title: '予定の作成',
      description: `予定を作成する。日時は ISO 8601（タイムゾーン付き）。終日の予定は allDay=true にし、endsAt には終了日（含む）の任意の時刻を指定する。ownerUserId は担当ユーザーの ID、null なら共有。remindBeforeMinutes は開始の何分前に通知するか（0/5/10/15/30/60/120/1440、null なら通知なし）。${RRULE_HELP}`,
      inputSchema: createEventSchema,
    },
    async (input) => jsonResult(await service.createEvent(input, ctx.userId)),
  );

  server.registerTool(
    'events_update',
    {
      title: '予定の更新',
      description:
        '予定を更新する（全項目を指定する）。繰り返し予定では scope を指定する: all=すべての回（既定）、this=occurrenceStart で指定した回だけ（日時・タイトル・メモのみ反映）、following=その回以降すべて（元の予定を打ち切り新しい予定を作る）。',
      inputSchema: updateEventSchema.safeExtend({ id: uuidSchema }),
    },
    async ({ id, ...input }) => jsonResult(await service.updateEvent(id, input, ctx.userId)),
  );

  server.registerTool(
    'events_delete',
    {
      title: '予定の削除',
      description:
        '予定を削除する。繰り返し予定では scope を指定する: all=すべての回（既定）、this=occurrenceStart で指定した回だけ、following=その回以降すべて。',
      inputSchema: deleteEventSchema.safeExtend({ id: uuidSchema }),
    },
    async ({ id, ...input }) => {
      await service.deleteEvent(id, input, ctx.userId);
      return textResult('削除しました');
    },
  );
};
