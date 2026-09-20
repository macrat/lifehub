import { addDays } from 'date-fns';
import { toDateString } from '../../../shared/date.ts';
import type { NotificationSource } from '../../lib/notifications/types.ts';
import { parseKeyTime } from '../../lib/notifications/types.ts';
import { type EventOccurrence, listOccurrences } from './service.ts';

const SOURCE_ID = 'event';
const MAX_REMIND_MS = 1440 * 60 * 1000;

/** キー: event:<id>:<occurrenceStart ISO>:<配信予定時刻 ISO> */
function keyOf(occurrence: EventOccurrence, at: Date): string {
  return `${SOURCE_ID}:${occurrence.id}:${occurrence.occurrenceStart}:${at.toISOString()}`;
}

function remindAt(occurrence: EventOccurrence): Date | null {
  if (occurrence.remindBeforeMinutes === null) return null;
  return new Date(
    new Date(occurrence.startsAt).getTime() - occurrence.remindBeforeMinutes * 60 * 1000,
  );
}

const timeFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** 予定の開始 remind_before_minutes 前に、所有者（共有なら全員）の全端末へ */
export const eventsNotificationSource: NotificationSource = {
  id: SOURCE_ID,
  list: async (range) => {
    // 配信時刻が範囲内 ⇔ 開始が [from, to + 最大リマインド)
    const occurrences = await listOccurrences({
      from: range.from,
      to: new Date(range.to.getTime() + MAX_REMIND_MS),
    });
    const planned = [];
    for (const occurrence of occurrences) {
      const at = remindAt(occurrence);
      if (!at || at < range.from || at >= range.to) continue;
      planned.push({ key: keyOf(occurrence, at), at });
    }
    return planned;
  },
  resolve: async (key) => {
    const parts = key.split(':');
    const id = parts[1];
    const scheduledAt = parseKeyTime(key);
    if (!id || !scheduledAt) return null;
    // "event:<id>:" の後ろから末尾の ":<at>" を除いたものが occurrenceStart
    const occurrenceStart = key.slice(
      `${SOURCE_ID}:${id}:`.length,
      key.length - scheduledAt.toISOString().length - 1,
    );
    const anchor = new Date(occurrenceStart);
    if (Number.isNaN(anchor.getTime())) return null;
    const occurrences = await listOccurrences({
      from: addDays(anchor, -2),
      to: addDays(anchor, 2),
    });
    const occurrence = occurrences.find(
      (o) => o.id === id && o.occurrenceStart === occurrenceStart,
    );
    if (!occurrence) return null;
    const at = remindAt(occurrence);
    // 通知設定が消えた、または開始時刻が変わって配信時刻がずれたら送らない（新しい時刻で別途予約される）
    if (!at || at.getTime() !== scheduledAt.getTime()) return null;
    return {
      title: occurrence.title,
      body: occurrence.allDay
        ? `${toDateString(new Date(occurrence.startsAt))} 終日`
        : `${timeFormatter.format(new Date(occurrence.startsAt))} 開始${occurrence.location ? ` ・ ${occurrence.location}` : ''}`,
      url: `/calendar?date=${toDateString(new Date(occurrence.startsAt))}`,
      userIds: occurrence.ownerUserId ? [occurrence.ownerUserId] : null,
    };
  },
};
