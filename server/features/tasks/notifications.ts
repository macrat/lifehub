import { addDays, toDateString } from '../../../shared/date.ts';
import {
  type NotificationSource,
  notificationTimeFormatter,
  type PlannedNotification,
  splitKey,
} from '../../lib/notifications/types.ts';
import { listOccurrences, type TaskOccurrence } from './service.ts';

const SOURCE_ID = 'task';
const KINDS = ['start', 'due'] as const;
type Kind = (typeof KINDS)[number];

/** キー: task:<id>:<occurrenceKey>:<start|due>:<配信予定時刻 ISO> */
function keyOf(occurrence: TaskOccurrence, kind: Kind, at: Date): string {
  return `${SOURCE_ID}:${occurrence.id}:${occurrence.occurrenceKey}:${kind}:${at.toISOString()}`;
}

function notifyAt(occurrence: TaskOccurrence, kind: Kind): Date | null {
  if (occurrence.completedAt !== null) return null;
  if (kind === 'start')
    return occurrence.notifyAtStart && occurrence.startsAt ? new Date(occurrence.startsAt) : null;
  return occurrence.notifyAtDue && occurrence.dueAt ? new Date(occurrence.dueAt) : null;
}

/** タスクの開始日時・期限日時ちょうどに、担当者（共有なら全員）の全端末へ */
export const tasksNotificationSource: NotificationSource = {
  id: SOURCE_ID,
  list: async (range) => {
    // 表示位置は「今日」に繰り越されるので、範囲の前後 1 日を含めて取り出し、通知時刻で絞る
    const occurrences = await listOccurrences(
      { from: addDays(toDateString(range.from), -1), to: addDays(toDateString(range.to), 1) },
      range.from,
    );
    const planned: PlannedNotification[] = [];
    for (const occurrence of occurrences) {
      for (const kind of KINDS) {
        const at = notifyAt(occurrence, kind);
        if (!at || at < range.from || at >= range.to) continue;
        planned.push({ key: keyOf(occurrence, kind, at), at });
      }
    }
    return planned;
  },
  resolve: async (key) => {
    const parsed = splitKey(SOURCE_ID, key);
    if (!parsed) return null;
    const { id, rest, scheduledAt } = parsed;
    const kindIndex = rest.lastIndexOf(':');
    const occurrenceKey = rest.slice(0, kindIndex);
    const kind = KINDS.find((k) => k === rest.slice(kindIndex + 1));
    if (!kind) return null;
    const date = toDateString(scheduledAt);
    const occurrences = await listOccurrences(
      { from: addDays(date, -1), to: addDays(date, 1) },
      scheduledAt,
    );
    const occurrence = occurrences.find((o) => o.id === id && o.occurrenceKey === occurrenceKey);
    if (!occurrence) return null;
    const at = notifyAt(occurrence, kind);
    if (!at || at.getTime() !== scheduledAt.getTime()) return null;
    return {
      title: `タスク: ${occurrence.title}`,
      body: `${kind === 'start' ? '開始' : '期限'} ${notificationTimeFormatter.format(at)}`,
      url: `/calendar?date=${occurrence.placementDate}`,
      userIds: occurrence.assigneeUserId ? [occurrence.assigneeUserId] : null,
    };
  },
};
