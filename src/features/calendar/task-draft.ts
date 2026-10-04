import { type CalendarTaskItem, TASK_TIME_LABELS } from '../../../shared/calendar.ts';
import { fromMinutesOfDay, minutesOfDay, toDateString } from '../../../shared/date.ts';
import { formatStart, fromDateValue } from '../../lib/date.ts';
import { carriedValues, type ItemFormValues, type WhenInput } from '../events/form-values.ts';
import { normalizeIsoInstants } from '../events/instants.ts';
import {
  type Draft,
  type DraftRange,
  itemDraft,
  sameRange,
  taskFrame,
  toTaskFrame,
} from './draft.ts';
import type { DraftOps, TaskTimes } from './grid-draft.ts';

/** 保存済みのタスクの日時。枠はそのタスクが置かれている所（完了したタスクはつままないので、無ければ fallback） */
export function taskTimesOf(task: CalendarTaskItem, fallback: DraftRange): TaskTimes {
  const { allDay, startsAt } = task;
  return { allDay, startsAt, frame: itemDraft(task) ?? fallback };
}

/**
 * 枠の所から始めるタスク: 開始は枠の開始。枠（`frame`。そのままグリッドに出す枠になる）は
 * タスクの形（`toTaskFrame`）にする。予定からタスクに切り替えたとき（引き継ぐのは開始だけ）と、
 * タスクを追加し始めるときに使う。
 */
export function newTaskTimes(range: DraftRange): TaskTimes {
  const startsAt = range.allDay
    ? fromDateValue(range.from)
    : fromMinutesOfDay(range.date, range.startMin);
  return { allDay: range.allDay, startsAt, frame: toTaskFrame(range) };
}

/**
 * 枠 range に置いたタスクの日時。枠が動いていなければ（range が frame と同じ）日時はそのまま。
 * 動かしたら、落とした所をそのまま開始にする。タスクは開始が未来ならその日に置かれるので、
 * 未来の日へ動かしたタスクはその日に現れる。
 * 時間軸の枠（時間指定）ならその日時。日の並びの帯なら日だけが決まるので、終日のタスクはその日、
 * 時刻を持つタスクは元の開始の時刻のままその日へ移す。
 */
export function taskTimesAt(
  times: TaskTimes,
  range: DraftRange,
): Pick<ItemFormValues, 'allDay' | 'startsAt'> {
  // WHY 動かしていなければそのまま: つまんだだけ・終日を切り替えただけで、日時が枠の形に丸められないように
  const { allDay, startsAt } = sameRange(range, times.frame) ? times : dropStart(times, range);
  return { allDay, startsAt };
}

/** 落とした所 → 開始（と終日か）。枠が決める日時の置き方は `taskTimesAt` のとおり */
function dropStart(times: TaskTimes, range: DraftRange): { allDay: boolean; startsAt: string } {
  if (!range.allDay)
    return { allDay: false, startsAt: fromMinutesOfDay(range.date, range.startMin) };
  if (times.allDay) return { allDay: true, startsAt: fromDateValue(range.from) };
  return { allDay: false, startsAt: fromMinutesOfDay(range.from, minutesOfDay(times.startsAt)) };
}

/**
 * 入力欄で直したタスクの日時 → それを動かす元になる日時（開始の所に置いた枠 `frame` ごと）。
 * スマホのシートを下の段に戻すとき、上の段で直した日時をグリッドの枠と見出しへ映すのに使う。
 * 開始の所に枠を置き、日時もその値にしておくので、`taskTimesAt` は入力した日時をそのまま返す。
 * 開始が空（書きかけ）なら枠に置けないので null（枠はそのまま）。
 */
export function taskDraftFromInput(input: WhenInput): TaskTimes | null {
  const { allDay, startsAt } = input;
  if (startsAt === null) return null;
  // 終日はその日の 0:00（保存形式）にそろえる
  return withTaskAllDay(
    { startsAt: normalizeIsoInstants(allDay, startsAt, null).startsAt },
    allDay,
  );
}

/**
 * タスクの終日の切り替え。日時はそのまま（終日なら日付として読み、時刻ありに戻せば元の時刻）で、
 * 枠を開始の所の形（終日なら 1 日の帯、時刻ありなら時間軸のブロック）に置き直す。
 */
function withTaskAllDay({ startsAt }: Pick<TaskTimes, 'startsAt'>, allDay: boolean): TaskTimes {
  const frame = taskFrame(toDateString(new Date(startsAt)), allDay ? null : minutesOfDay(startsAt));
  return { allDay, startsAt, frame };
}

/**
 * タスクの下書きの扱い（`DraftOps`）。日時は枠と、それを動かす元の日時（task）から導き（`taskTimesAt`）、
 * 入力で直した日時と終日の切り替えは、その元の日時ごと持ち替える（`taskDraftFromInput` / `withTaskAllDay`）。
 * 終日かどうかも元の日時が持つので、予定と同じく入力の側には状態を持たない。
 */
export function taskDraftOps(task: TaskTimes, { range, item }: Draft): DraftOps {
  const values: ItemFormValues = {
    ...carriedValues(item),
    ...taskTimesAt(task, range),
    kind: 'task',
    endsAt: null,
    remindEndMinutes: null,
  };
  return {
    values,
    rangeText: taskDraftText(values),
    fromInput: (input) => {
      const next = taskDraftFromInput(input);
      return next && { task: next };
    },
    // 入力欄の開始（読めなければ今の枠に置いた開始）を保ったまま切り替える
    withAllDay: (input, allDay) => ({
      task: withTaskAllDay((input && taskDraftFromInput(input)) ?? values, allDay),
    }),
  };
}

/** クイック入力の見出し（開始）。終日なら日付だけ */
export function taskDraftText({
  allDay,
  startsAt,
}: Pick<ItemFormValues, 'allDay' | 'startsAt'>): string {
  return `${TASK_TIME_LABELS.start} ${formatStart(startsAt, allDay)}`;
}
