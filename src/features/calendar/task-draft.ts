import {
  type CalendarTaskItem,
  normalizeIsoInstants,
  TASK_TIME_LABELS,
  taskTime,
} from '../../../shared/calendar.ts';
import { fromMinutesOfDay, minutesOfDay, toDateString } from '../../../shared/date.ts';
import { formatEdge, fromDateValue } from '../../lib/date.ts';
import { carriedValues, type ItemFormValues } from '../events/form-values.ts';
import {
  type Draft,
  type DraftOps,
  type DraftRange,
  itemDraft,
  sameRange,
  taskFrame,
  toTaskFrame,
  type WhenInput,
} from './draft.ts';

/**
 * グリッドの枠で動かすタスクの日時（開始・期限と、終日か）と、その日時が置かれていた枠（frame）。
 * 枠を動かすと、frame から動かした分だけ開始・期限をずらす（`taskTimesAt`）。
 * 保存済みのタスクをつまんだときはそのタスクの日時（`taskTimesOf`）、予定から切り替えたときや
 * 追加するときは枠の開始（`newTaskTimes`）、入力で直したときは入力した日時（`taskDraftFromInput`）から始める。
 * WHY 下書きの item（直しているタスク）とは別に持つ: item は保存の宛先で、追加や予定から切り替えたタスクには無い。
 * 日時の元を item に持たせると、追加するタスクの期限を入れる場所が無くなる。
 */
export type TaskTimes = Pick<ItemFormValues, 'allDay' | 'startsAt' | 'endsAt'> & {
  frame: DraftRange;
};

/** 保存済みのタスクの日時。枠はそのタスクが置かれている所（完了したタスクはつままないので、無ければ fallback） */
export function taskTimesOf(task: CalendarTaskItem, fallback: DraftRange): TaskTimes {
  const { allDay, startsAt, endsAt } = task;
  return { allDay, startsAt, endsAt, frame: itemDraft(task) ?? fallback };
}

/**
 * 枠の所から始めるタスク: 開始は枠の開始、期限は無し。枠（`frame`。そのままグリッドに出す枠になる）は
 * タスクの形（`toTaskFrame`）にする。予定からタスクに切り替えたとき（引き継ぐのは開始だけ）と、
 * タスクを追加し始めるときに使う。
 */
export function newTaskTimes(range: DraftRange): TaskTimes {
  const startsAt = range.allDay
    ? fromDateValue(range.from)
    : fromMinutesOfDay(range.date, range.startMin);
  return { allDay: range.allDay, startsAt, endsAt: null, frame: toTaskFrame(range) };
}

/**
 * 枠 range に置いたタスクの日時。枠が動いていなければ（range が frame と同じ）日時はそのまま。
 * 動かしたら、落とした所をそのまま開始にし、期限は元の開始〜期限の長さを保ってずらす
 * （開始が無ければ、枠を動かした分だけずらす）。
 * WHY 開始にする: タスクは開始が未来ならその日に置かれるので、落とした所が開始になれば、未来の日へ動かした
 * タスクはその日に現れる。期限を動かすだけだと、表示の日（開始の日か今日）は変わらず、動かしたのに元の日に
 * 残って見える。
 * 時間軸の枠（時間指定）ならその日時。日の並びの帯なら日だけが決まるので、終日のタスクはその日、
 * 時刻を持つタスクは元の時刻（開始、無ければ期限）のままその日へ移す。日時の無いタスクは日だけのタスクにする。
 */
export function taskTimesAt(
  times: TaskTimes,
  range: DraftRange,
): Pick<ItemFormValues, 'allDay' | 'startsAt' | 'endsAt'> {
  // WHY 動かしていなければそのまま: つまんだだけ・終日を切り替えただけで、開始の無いタスクに開始が付いたり
  // 日時が枠の形に丸められたりしないように
  if (sameRange(range, times.frame)) {
    const { allDay, startsAt, endsAt } = times;
    return { allDay, startsAt, endsAt };
  }
  const start = dropStart(times, range);
  // 開始が無ければ、動かす前の枠の開始から数える（落とした所までずらした分だけ期限もずらす）
  const from = times.startsAt ?? dropStart(times, times.frame).startsAt;
  const shift = Date.parse(start.startsAt) - Date.parse(from);
  return {
    ...start,
    endsAt: times.endsAt && new Date(Date.parse(times.endsAt) + shift).toISOString(),
  };
}

/** 落とした所 → 開始（と終日か）。枠が決める日時の置き方は `taskTimesAt` のとおり */
function dropStart(times: TaskTimes, range: DraftRange): { allDay: boolean; startsAt: string } {
  if (!range.allDay)
    return { allDay: false, startsAt: fromMinutesOfDay(range.date, range.startMin) };
  // 時刻はタスクの基準日時（`taskTime`。動かすのは未完了のタスクなので開始 → 期限）のもの。終日・日時なしでは時刻が無い
  const at = taskTime({ ...times, completedAt: null })?.at;
  if (!at) return { allDay: true, startsAt: fromDateValue(range.from) };
  return { allDay: false, startsAt: fromMinutesOfDay(range.from, minutesOfDay(at)) };
}

/**
 * 入力欄で直したタスクの日時 → それを動かす元になる日時（開始の所に置いた枠 `frame` ごと）。
 * スマホのシートを下の段に戻すとき、上の段で直した日時をグリッドの枠と見出しへ映すのに使う。
 * 開始の所に枠を置き、日時もその値にしておくので、`taskTimesAt` は入力した日時をそのまま返す
 * （期限も入力したまま。枠から数え直さない）。開始が空なら枠に置けないので null（枠はそのまま）。
 * input は入力欄の形（終日の期限は「含む日」）で、保存されている形（排他的な終端）で持つ。
 */
export function taskDraftFromInput(input: WhenInput): TaskTimes | null {
  const { allDay, startsAt } = input;
  if (startsAt === null) return null;
  return {
    allDay,
    ...normalizeIsoInstants(allDay, startsAt, input.endsAt),
    frame: taskFrame(toDateString(new Date(startsAt)), allDay ? null : minutesOfDay(startsAt)),
  };
}

/**
 * タスクの終日の切り替え。日時はそのまま（終日なら日付として読み、時刻ありに戻せば元の時刻）で、
 * 枠だけを開始の所の形（終日なら 1 日の帯、時刻ありなら時間軸のブロック）に置き直す。
 * 開始が無ければ枠に置けないので、枠はそのまま。
 */
function withTaskAllDay(times: TaskTimes, allDay: boolean): TaskTimes {
  const { startsAt } = times;
  const frame = startsAt
    ? taskFrame(toDateString(new Date(startsAt)), allDay ? null : minutesOfDay(startsAt))
    : times.frame;
  return { ...times, allDay, frame };
}

/**
 * タスクの下書きの扱い（`DraftOps`）。日時は枠と、それを動かす元の日時（task）から導き（`taskTimesAt`）、
 * 入力で直した日時と終日の切り替えは、その元の日時ごと持ち替える（`taskDraftFromInput` / `withTaskAllDay`）。
 * 終日かどうかも元の日時が持つので、予定と同じく入力の側には状態を持たない。
 */
export function taskDraftOps(task: TaskTimes, { range, item }: Draft): DraftOps {
  const values = { ...carriedValues(item, 'task'), ...taskTimesAt(task, range) };
  return {
    values,
    rangeText: taskDraftText(values),
    fromInput: (input) => {
      const next = taskDraftFromInput(input);
      return next && { task: next };
    },
    withAllDay: (input, allDay) => {
      // 入力欄の日時（読めなければ今の枠に置いた日時）を保ったまま切り替える
      const { allDay: current, startsAt, endsAt } = values;
      const base = (input && taskDraftFromInput(input)) ?? {
        allDay: current,
        startsAt,
        endsAt,
        frame: range,
      };
      return { task: withTaskAllDay(base, allDay) };
    },
  };
}

/** クイック入力の見出し（開始と期限）。終日なら日付だけ */
export function taskDraftText({ allDay, startsAt, endsAt }: ItemFormValues): string {
  const parts = [
    startsAt && `${TASK_TIME_LABELS.start} ${formatEdge(startsAt, 'start', allDay)}`,
    endsAt && `${TASK_TIME_LABELS.due} ${formatEdge(endsAt, 'end', allDay)}`,
  ];
  return parts.filter(Boolean).join(' / ') || '日時なし';
}
