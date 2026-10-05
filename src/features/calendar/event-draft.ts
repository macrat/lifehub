import type { CalendarItem } from '../../../shared/calendar.ts';
import { inclusiveEndDate, toDateString } from '../../../shared/date.ts';
import { formatDate, formatMinutesOfDay } from '../../lib/date.ts';
import {
  allDayEventValues,
  carriedValues,
  eventValuesForRange,
  type ItemFormValues,
  type WhenInput,
} from '../events/form-values.ts';
import { type Draft, type DraftRange, withAllDay } from './draft.ts';
import type { DraftOps } from './grid-draft.ts';
import { timedMinutes } from './timeline-layout.ts';

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
 * 保存済みの予定・タスクを直しているときは、その内容に枠の日時だけを重ねる
 * （タイトル・場所・メモ・繰り返し・通知はそのまま持ち越し、枠を動かしても消えない。参加者は呼び出し側が重ねる）。
 * 終了前の通知は予定から持ち越し、タスク（入力で予定に切り替えた）には無いので通知なし。
 */
function draftValues(draft: DraftRange, item: CalendarItem | null): ItemFormValues {
  const when = draft.allDay
    ? allDayEventValues(draft.from, draft.to, [])
    : eventValuesForRange(draft.date, draft.startMin, draft.endMin, []);
  return item === null
    ? when
    : {
        ...when,
        ...carriedValues(item),
        remindEndMinutes: item.kind === 'event' ? item.remindEndMinutes : null,
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
 * 翌日 0:00 に終わる時間指定はその日の 24:00 として枠に出す（置いた予定と同じ規則。`timedMinutes`）。
 */
function draftFromInstants(allDay: boolean, startsAt: string, endsAt: string): DraftRange | null {
  const from = toDateString(new Date(startsAt));
  if (allDay) {
    // 終日の入力の終わりは「含む終了日」
    const to = toDateString(new Date(endsAt));
    return to >= from ? { allDay: true, from, to } : null;
  }
  // 終わりは含まない（翌日 0:00 に終わればその日のうち）。置いた予定の日数（`placeEvent`）と同じ数え方
  if (inclusiveEndDate(endsAt) !== from) return null;
  const { startMin, endMin } = timedMinutes(startsAt, endsAt);
  return endMin > startMin ? { allDay: false, date: from, startMin, endMin } : null;
}
