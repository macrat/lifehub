import { dateRangeQuerySchema } from '../../../shared/validation/common.ts';
import { jsonResult, type ToolRegistrar } from '../../lib/mcp/types.ts';
import * as service from './service.ts';

export const registerCalendarTools: ToolRegistrar = (server) => {
  server.registerTool(
    'calendar_list_items',
    {
      title: 'カレンダー項目の一覧',
      description:
        '指定した期間（JST の日付、両端を含む）の予定とタスクを、カレンダー画面と同じ並び（placementDate 順）で統合して返す。kind が "event" なら予定、"task" ならタスク。予定の変更は events_*、タスクの変更は tasks_* のツールで行う。',
      inputSchema: dateRangeQuerySchema,
    },
    async (range) => jsonResult(await service.listItems(range)),
  );
};
