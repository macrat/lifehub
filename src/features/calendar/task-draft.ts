import {
  type CalendarTaskItem,
  normalizeIsoInstants,
  TASK_TIME_LABELS,
} from '../../../shared/calendar.ts';
import { fromMinutesOfDay, minutesOfDay, toDateString } from '../../../shared/date.ts';
import { formatEdge, fromDateValue } from '../../lib/date.ts';
import type { ItemFormValues } from '../events/form-values.ts';
import { type DraftRange, itemDraft, taskFrame, toTaskFrame } from './draft.ts';

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
 * 枠の所から始めるタスク: 開始は枠の開始、期限は無し。枠はタスクの形（`toTaskFrame`）にする。
 * 予定からタスクに切り替えたとき（引き継ぐのは開始だけ）と、タスクを追加し始めるときに使う。
 */
export function newTaskTimes(range: DraftRange): { range: DraftRange; times: TaskTimes } {
  const frame = toTaskFrame(range);
  const startsAt = range.allDay
    ? fromDateValue(range.from)
    : fromMinutesOfDay(range.date, range.startMin);
  return { range: frame, times: { allDay: range.allDay, startsAt, endsAt: null, frame } };
}

/**
 * 枠 range に置いたタスクの日時。落とした所をそのまま開始にし、期限は元の開始〜期限の長さを保ってずらす
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
  const start = dropStart(times, range);
  // 開始が無ければ、動かす前の枠の開始から数える（落とした所までずらした分だけ期限もずらす）
  const from = times.startsAt ?? dropStart(times, times.frame).startsAt;
  const shift = Date.parse(start.startsAt) - Date.parse(from);
  return {
    ...start,
    endsAt: times.endsAt && new Date(Date.parse(times.endsAt) + shift).toISOString(),
  };
}

/**
 * つまんで動かした保存済みのタスクの値。日時は `taskTimesAt` のとおりで、繰り返しや通知などの残りの項目は
 * そのまま持ち越す（参加者はタスクのまま。選び直した参加者は呼び出し側が重ねる）。
 */
export function taskDraftValues(task: CalendarTaskItem, range: DraftRange): ItemFormValues {
  return { ...task, ...taskTimesAt(taskTimesOf(task, range), range) };
}

/** 落とした所 → 開始（と終日か）。枠が決める日時の置き方は `taskTimesAt` のとおり */
function dropStart(times: TaskTimes, range: DraftRange): { allDay: boolean; startsAt: string } {
  if (!range.allDay)
    return { allDay: false, startsAt: fromMinutesOfDay(range.date, range.startMin) };
  // 時刻はタスクの基準日時のもの（開始 → 期限）。終日・日時なしでは時刻が無い
  const at = times.allDay ? null : (times.startsAt ?? times.endsAt);
  if (!at) return { allDay: true, startsAt: fromDateValue(range.from) };
  return { allDay: false, startsAt: fromMinutesOfDay(range.from, minutesOfDay(at)) };
}

/**
 * 入力欄で直したタスクの日時 → つまんでいる枠と、それを動かす元になる日時。
 * スマホのシートを下の段に戻すとき、上の段で直した日時をグリッドの枠と見出しへ映すのに使う。
 * 開始の所に枠を置き、日時もその値にしておくので、`taskTimesAt` は入力した日時をそのまま返す
 * （期限も入力したまま。枠から数え直さない）。開始が空なら枠に置けないので null（枠はそのまま）。
 * input は入力欄の形（終日の期限は「含む日」）で、保存されている形（排他的な終端）で持つ。
 */
export function taskDraftFromInput(input: {
  allDay: boolean;
  startsAt: string | null;
  endsAt: string | null;
}): { range: DraftRange; times: TaskTimes } | null {
  const { allDay, startsAt } = input;
  if (startsAt === null) return null;
  const range = taskFrame(toDateString(new Date(startsAt)), allDay ? null : minutesOfDay(startsAt));
  return {
    range,
    times: { allDay, ...normalizeIsoInstants(allDay, startsAt, input.endsAt), frame: range },
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
