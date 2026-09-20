import { dateRangeQuerySchema, uuidSchema } from '../../../shared/validation/common.ts';
import {
  completeTaskSchema,
  createTaskSchema,
  deleteTaskSchema,
  updateTaskSchema,
} from '../../../shared/validation/tasks.ts';
import { jsonResult, type ToolRegistrar, textResult } from '../../lib/mcp/types.ts';
import * as service from './service.ts';

export const registerTaskTools: ToolRegistrar = (server, ctx) => {
  server.registerTool(
    'tasks_list',
    {
      title: 'タスクの一覧',
      description:
        '指定した期間（JST の日付、両端を含む）に表示位置（placementDate）を持つタスクを列挙する。未完了で開始日時が過去または未設定のタスクは今日の位置に繰り越される。繰り返しタスクは未完了の直近 2 回だけが並ぶ。各項目の occurrenceKey は完了・更新・削除で回を指定するのに使う（単発は "single"）。',
      inputSchema: dateRangeQuerySchema,
    },
    async (range) => jsonResult(await service.listOccurrences(range)),
  );

  server.registerTool(
    'tasks_create',
    {
      title: 'タスクの作成',
      description:
        'タスクを作成する。startsAt（開始日時）と dueAt（期限日時）はどちらも任意の ISO 8601。assigneeUserId は担当ユーザーの ID、null なら共有。rrule は RFC 5545 の RRULE（DTSTART なし。繰り返すには startsAt か dueAt が必要）。notifyAtStart / notifyAtDue で開始・期限の時刻に通知する。',
      inputSchema: createTaskSchema,
    },
    async (input) => jsonResult(await service.createTask(input, ctx.userId)),
  );

  server.registerTool(
    'tasks_complete',
    {
      title: 'タスクの完了',
      description: 'タスクの回を完了にする。occurrenceKey は tasks_list の値（単発は "single"）。',
      inputSchema: completeTaskSchema.safeExtend({ id: uuidSchema }),
    },
    async ({ id, occurrenceKey }) => {
      await service.completeTask(id, occurrenceKey, ctx.userId);
      return textResult('完了にしました');
    },
  );

  server.registerTool(
    'tasks_uncomplete',
    {
      title: 'タスクの完了取り消し',
      description: 'タスクの回の完了を取り消す。',
      inputSchema: completeTaskSchema.safeExtend({ id: uuidSchema }),
    },
    async ({ id, occurrenceKey }) => {
      await service.uncompleteTask(id, occurrenceKey);
      return textResult('完了を取り消しました');
    },
  );

  server.registerTool(
    'tasks_update',
    {
      title: 'タスクの更新',
      description:
        'タスクを更新する（全項目を指定する）。繰り返しタスクでは scope を指定する: all=すべての回（既定）、this=occurrenceKey で指定した回だけ、following=その回以降すべて。',
      inputSchema: updateTaskSchema.safeExtend({ id: uuidSchema }),
    },
    async ({ id, ...input }) => jsonResult(await service.updateTask(id, input, ctx.userId)),
  );

  server.registerTool(
    'tasks_delete',
    {
      title: 'タスクの削除',
      description:
        'タスクを削除する。繰り返しタスクでは scope（all / this / following）と occurrenceKey を指定する。',
      inputSchema: deleteTaskSchema.safeExtend({ id: uuidSchema }),
    },
    async ({ id, ...input }) => {
      await service.deleteTask(id, input, ctx.userId);
      return textResult('削除しました');
    },
  );
};
