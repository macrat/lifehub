import type { CalendarItem } from '../../../shared/calendar.ts';
import { minutesOfDay, toDateString } from '../../../shared/date.ts';
import { formatDate, formatMinutesOfDay } from '../../lib/date.ts';
import {
  allDayEventValues,
  eventValuesForRange,
  type ItemFormValues,
} from '../events/form-values.ts';
import type { DraftRange } from './draft.ts';

/**
 * 予定の下書き ↔ フォームの値（クイック入力の見出し・既定値、入力で直した日時の映し戻し）。
 * タスクの同じものは `task-draft.ts`
 */

/** 下書きの期間の表示（クイック入力の見出し） */
export function draftText(draft: DraftRange): string {
  if (draft.allDay) {
    const days =
      draft.from === draft.to
        ? formatDate(draft.from)
        : `${formatDate(draft.from)}〜${formatDate(draft.to)}`;
    return `${days} 終日`;
  }
  return `${formatDate(draft.date)} ${formatMinutesOfDay(draft.startMin)}〜${formatMinutesOfDay(draft.endMin)}`;
}

/**
 * クイック入力と全項目のフォーム（「その他のオプション」）に渡す既定値。
 * 保存済みの予定を直しているときは、その予定の内容に枠の日時と選んでいる参加者だけを重ねる
 * （タイトル・場所・メモ・繰り返し・通知はそのまま持ち越し、枠を動かしても消えない）。
 */
export function draftValues(
  draft: DraftRange,
  participantIds: string[],
  item: CalendarItem | null = null,
): ItemFormValues {
  const when = draft.allDay
    ? allDayEventValues(draft.from, draft.to, participantIds)
    : eventValuesForRange(draft.date, draft.startMin, draft.endMin, participantIds);
  return item === null
    ? when
    : {
        ...item,
        allDay: when.allDay,
        startsAt: when.startsAt,
        endsAt: when.endsAt,
        participantIds,
      };
}

/**
 * 保存する形の日時 → 下書き（グリッドの枠）。フォームで直した日時を枠に映し戻すのに使う。
 * 枠に出せない範囲（日をまたぐ時間指定、終わりが始まりより前）は null で、枠はそのままにする。
 */
export function draftFromInstants(
  allDay: boolean,
  startsAt: string,
  endsAt: string,
): DraftRange | null {
  const from = toDateString(new Date(startsAt));
  if (allDay) {
    // 終日の入力の終わりは「含む終了日」
    const to = toDateString(new Date(endsAt));
    return to >= from ? { allDay: true, from, to } : null;
  }
  if (toDateString(new Date(endsAt)) !== from) return null;
  const startMin = minutesOfDay(startsAt);
  const endMin = minutesOfDay(endsAt);
  return endMin > startMin ? { allDay: false, date: from, startMin, endMin } : null;
}
