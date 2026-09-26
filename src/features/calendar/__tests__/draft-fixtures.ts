import type { CalendarItem } from '../../../../shared/calendar.ts';
import type { DateString } from '../../../../shared/types.ts';
import { type DayGrab, dayDraft } from '../day-draft.ts';
import type { AllDayDraft, TimedDraft } from '../draft.ts';
import { type TimeGrab, type TimePoint, timeDraft } from '../time-draft.ts';

/** 下書き（`draft.ts`）のテストで共有する日付・下書き・予定と、なぞる操作の略記 */

export const DAY = '2031-06-05' as DateString;
export const at = (minutes: number): TimePoint => ({ date: DAY, min: minutes });
/** 空いている所を from → to へなぞる（moved を省くとその場で離したタップ・クリック） */
export const select = (from: TimePoint, to: TimePoint, moved = false) =>
  timeDraft({ grab: null, from, to, moved });
/** 下書きを kind の所でつまんで from → to へ動かす（追加の下書きなので直す予定は無い） */
export const grabbed = (
  draft: TimedDraft,
  kind: TimeGrab['kind'],
  from: TimePoint,
  to: TimePoint,
) => timeDraft({ grab: { kind, draft, item: null }, from, to, moved: true });

export const allDay = (from: string, to: string): AllDayDraft => ({
  allDay: true,
  from: from as DateString,
  to: to as DateString,
});
export const day = (date: string) => date as DateString;
/** 時間指定の下書き（日の並びでは 1 日ぶんの帯になる） */
export const timed = select(at(9 * 60), at(10 * 60), true);
/** 空いている所を from → to へなぞる */
export const selectDays = (from: string, to: string) =>
  dayDraft({ grab: null, from: day(from), to: day(to), moved: true });
/** 下書きをつまんで from → to へ動かす（moved を省くとつまんだだけで動かしていない） */
export const draggedDays = (grab: DayGrab, from: string, to: string, moved = true) =>
  dayDraft({ grab, from: day(from), to: day(to), moved });

/** 保存済みの予定（繰り返しの 1 回。9:00〜10:00） */
export const event = {
  kind: 'event',
  id: 'e1',
  title: '打ち合わせ',
  allDay: false,
  startsAt: '2031-06-05T00:00:00.000Z',
  endsAt: '2031-06-05T01:00:00.000Z',
  completedAt: null,
  location: '会議室',
  note: 'メモ',
  participantIds: ['u1'],
  rrule: 'FREQ=WEEKLY',
  remindStartMinutes: 10,
  remindEndMinutes: null,
  occurrenceStart: '2031-06-05T00:00:00.000Z',
  isRecurring: true,
  isModified: false,
  placementDate: DAY,
  dayIndex: 1,
  dayCount: 1,
} satisfies CalendarItem;

/** 保存済みの未完了のタスク（単発。6/5 9:00 開始、6/5 18:00 期限。6/5 に置かれ、時間軸では開始の 9:00） */
export const task = {
  kind: 'task',
  id: 't1',
  title: '書類を出す',
  allDay: false,
  startsAt: '2031-06-05T00:00:00.000Z',
  endsAt: '2031-06-05T09:00:00.000Z',
  completedAt: null,
  location: null,
  note: null,
  participantIds: ['u1'],
  rrule: null,
  remindStartMinutes: null,
  remindEndMinutes: 0,
  occurrenceStart: null,
  isRecurring: false,
  isModified: false,
  placementDate: DAY,
  isOverdue: false,
} satisfies CalendarItem;
