import type { CalendarItem } from '../../../shared/calendar.ts';
import { DAY_MINUTES } from '../../../shared/constants.ts';
import { addDays, minutesOfDay, toDateString } from '../../../shared/date.ts';
import { formatDate, formatMinutesOfDay } from '../../lib/date.ts';
import {
  allDayEventValues,
  carriedValues,
  eventValuesForRange,
  type ItemFormValues,
} from '../events/form-values.ts';
import { type Draft, type DraftOps, type DraftRange, type WhenInput, withAllDay } from './draft.ts';

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
 * 保存済みの予定を直しているときは、その予定の内容に枠の日時だけを重ねる
 * （タイトル・場所・メモ・繰り返し・通知はそのまま持ち越し、枠を動かしても消えない。参加者は呼び出し側が重ねる）。
 * 直しているのがタスク（入力で予定に切り替えた）なら、期限前の通知は持ち越さない（`carriedValues`）。
 */
function draftValues(draft: DraftRange, item: CalendarItem | null): ItemFormValues {
  const when = draft.allDay
    ? allDayEventValues(draft.from, draft.to, [])
    : eventValuesForRange(draft.date, draft.startMin, draft.endMin, []);
  return item === null
    ? when
    : {
        ...carriedValues(item, 'event'),
        allDay: when.allDay,
        startsAt: when.startsAt,
        endsAt: when.endsAt,
      };
}

/**
 * 予定の下書きの扱い（`DraftOps`）。日時（終日かどうかを含む）は枠（range）だけが持つ。入力で直した日時と
 * 終日の切り替えは枠へ戻し、見出し・グリッドの枠・保存する日時がいつも同じ枠から決まるようにする
 * （入力の側にも持つと、開いたままグリッドで別の種類の枠を選び直したときに食い違う）。
 */
export function eventDraftOps({ range, item }: Draft): DraftOps {
  /** 入力欄の日時 → 枠。枠に出せない範囲（日をまたぐ時間指定など）・書きかけなら null */
  const rangeOf = ({ allDay, startsAt, endsAt }: WhenInput) =>
    startsAt && endsAt ? draftFromInstants(allDay, startsAt, endsAt) : null;
  return {
    values: draftValues(range, item),
    rangeText: draftText(range),
    fromInput: (input) => {
      const next = rangeOf(input);
      return next && { range: next };
    },
    // 終日は枠そのものを切り替える（時間指定からはその日 1 日、終日からは既定の時間帯。`withAllDay`）
    withAllDay: (input, allDay) => ({
      range: withAllDay((input && rangeOf(input)) ?? range, allDay),
    }),
  };
}

/**
 * 保存する形の日時 → 下書き（グリッドの枠）。フォームで直した日時を枠に映し戻すのに使う。
 * 枠に出せない範囲（日をまたぐ時間指定、終わりが始まりより前）は null で、枠はそのままにする。
 * 翌日 0:00 に終わる時間指定はその日の 24:00 として枠に出す（置く側の `timedSlot` と同じ）。
 */
function draftFromInstants(allDay: boolean, startsAt: string, endsAt: string): DraftRange | null {
  const from = toDateString(new Date(startsAt));
  if (allDay) {
    // 終日の入力の終わりは「含む終了日」
    const to = toDateString(new Date(endsAt));
    return to >= from ? { allDay: true, from, to } : null;
  }
  const endDate = toDateString(new Date(endsAt));
  const startMin = minutesOfDay(startsAt);
  const endMin =
    endDate === from
      ? minutesOfDay(endsAt)
      : endDate === addDays(from, 1) && minutesOfDay(endsAt) === 0
        ? DAY_MINUTES
        : null;
  if (endMin === null) return null;
  return endMin > startMin ? { allDay: false, date: from, startMin, endMin } : null;
}
