import {
  type CalendarItem,
  normalizeIsoInstants,
  TASK_TIME_LABELS,
  taskTime,
} from '../../../shared/calendar.ts';
import { fromMinutesOfDay, minutesOfDay, toDateString } from '../../../shared/date.ts';
import { formatEdge, fromDateValue } from '../../lib/date.ts';
import type { ItemFormValues } from '../events/form-values.ts';
import { type EventDraft, itemDraft, taskFrame } from './draft.ts';

/** カレンダーに置かれたタスク（つまんで動かす対象） */
export type TaskItem = Extract<CalendarItem, { kind: 'task' }>;

/**
 * グリッドでつまんで動かしたタスクの値。落とした所をそのまま開始にし、期限は元の開始〜期限の長さを保ってずらす
 * （開始が無ければ、枠を動かした分だけずらす）。
 * WHY 開始にする: タスクは開始が未来ならその日に置かれるので、落とした所が開始になれば、未来の日へ動かした
 * タスクはその日に現れる。期限を動かすだけだと、表示の日（開始の日か今日）は変わらず、動かしたのに元の日に
 * 残って見える。
 * 時間軸の枠（時間指定）ならその日時。日の並びの帯なら日だけが決まるので、終日のタスクはその日、
 * 時刻を持つタスクは元の時刻（開始、無ければ期限）のままその日へ移す。日時の無いタスクは日だけのタスクにする。
 * 繰り返しや通知などの残りの項目と、選んでいる参加者はそのまま持ち越す。
 */
export function taskDraftValues(
  task: TaskItem,
  range: EventDraft,
  participantIds: string[],
): ItemFormValues {
  const start = dropStart(task, range);
  // 開始が無ければ、動かす前の枠の開始から数える（落とした所までずらした分だけ期限もずらす）
  const from = task.startsAt ?? dropStart(task, itemDraft(task) ?? range).startsAt;
  const shift = Date.parse(start.startsAt) - Date.parse(from);
  return {
    ...task,
    ...start,
    endsAt: task.endsAt && new Date(Date.parse(task.endsAt) + shift).toISOString(),
    participantIds,
  };
}

/** 落とした所 → 開始（と終日か）。枠が決める日時の置き方は `taskDraftValues` のとおり */
function dropStart(task: TaskItem, range: EventDraft): { allDay: boolean; startsAt: string } {
  if (!range.allDay)
    return { allDay: false, startsAt: fromMinutesOfDay(range.date, range.startMin) };
  // 時刻はタスクの基準日時のもの（`taskTime`。つまめるのは未完了のタスクだけなので開始 → 期限）。
  // 終日・日時なしでは時刻が無い
  const at = taskTime(task)?.at;
  if (!at) return { allDay: true, startsAt: fromDateValue(range.from) };
  return { allDay: false, startsAt: fromMinutesOfDay(range.from, minutesOfDay(at)) };
}

/**
 * 入力欄で直したタスクの日時 → つまんでいる枠と、それを動かす元になるタスク。
 * スマホのシートを下の段に戻すとき、上の段で直した日時をグリッドの枠と見出しへ映すのに使う。
 * 開始の所に枠を置き、タスクの日時もその値にしておくので、`taskDraftValues` は入力した日時をそのまま返す
 * （期限も入力したまま。枠から数え直さない）。開始が空なら枠に置けないので null（枠はそのまま）。
 * input は入力欄の形（終日の期限は「含む日」）で、タスクには保存されている形（排他的な終端）で持たせる。
 */
export function taskDraftFromInput(
  task: TaskItem,
  input: { allDay: boolean; startsAt: string | null; endsAt: string | null },
): { range: EventDraft; item: TaskItem } | null {
  const { allDay, startsAt } = input;
  if (startsAt === null) return null;
  return {
    range: taskFrame(toDateString(new Date(startsAt)), allDay ? null : minutesOfDay(startsAt)),
    item: { ...task, allDay, ...normalizeIsoInstants(allDay, startsAt, input.endsAt) },
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
