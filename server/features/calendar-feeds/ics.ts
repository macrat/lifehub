import ical, { ICalCalendarMethod } from 'ical-generator';
import type { Occurrence } from '../../../shared/calendar.ts';
import { toDateString } from '../../../shared/date.ts';

/**
 * 予定の発生を iCalendar（RFC 5545）の本文にする。組み立ては `ical-generator` に任せ、
 * 値の詰め替えだけを行う（エスケープ・75 オクテットでの折り返し・DATE と DATE-TIME の
 * 書き分けは仕様の細部が多く、自前で持つ価値が無い）。
 */

/** 購読側のカレンダーに出る名前 */
const CALENDAR_NAME = 'LifeHub';

/** 取り直しの推奨間隔（秒）。購読側が従うとは限らないが、従うものには無駄な取得をさせない */
const REFRESH_SECONDS = 60 * 60;

export function toIcs(occurrences: Occurrence[], now: Date): string {
  const calendar = ical({
    name: CALENDAR_NAME,
    prodId: { company: 'lifehub', product: 'calendar', language: 'JA' },
    // 購読して読むだけのカレンダー（出欠の返事を求めるものではない）
    method: ICalCalendarMethod.PUBLISH,
    ttl: REFRESH_SECONDS,
  });
  for (const occurrence of occurrences) {
    // 渡されるのは予定だけ（呼び出し側が kind で絞る）。種別で絞って終了を読む
    if (occurrence.kind !== 'event') continue;
    const startsAt = new Date(occurrence.startsAt);
    const endsAt = new Date(occurrence.endsAt);
    calendar.createEvent({
      id: uidOf(occurrence),
      allDay: occurrence.allDay,
      /**
       * 終日は JST の暦日そのもの（DATE 値）で書く。瞬間で渡すと `ical-generator` が
       * プロセスのタイムゾーン（Vercel では UTC）で日付にするため、JST の 0:00 が前日になる。
       * 終端はどちらも排他的で、保存している「翌日 JST 0:00」がそのまま DTEND になる。
       * 時刻付きは瞬間のまま渡す（UTC の DATE-TIME になり、TZID も VTIMEZONE も要らない）。
       */
      start: occurrence.allDay ? toDateString(startsAt) : startsAt,
      end: occurrence.allDay ? toDateString(endsAt) : endsAt,
      summary: occurrence.title,
      location: occurrence.location,
      description: occurrence.note,
      stamp: now,
    });
  }
  return calendar.toString();
}

/**
 * 回ごとに変わらない UID。購読側はこれで同じ予定を追い続け、取り直しても増やさない。
 * 繰り返しは行の id が回を区別しないので、その回の基準日時を添える
 * （「この回だけ」の変更で日時が動いても基準日時は変わらないため、動かしたことが伝わる）。
 */
function uidOf(occurrence: Occurrence): string {
  const id = occurrence.occurrenceStart
    ? `${occurrence.id}-${occurrence.occurrenceStart}`
    : occurrence.id;
  return `${id}@lifehub`;
}
