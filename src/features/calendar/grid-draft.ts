import type { EventKind } from '../../../shared/validation/events.ts';
import type { ItemFormValues, WhenInput } from '../events/form-values.ts';
import type { Draft, DraftRange } from './draft.ts';

/**
 * 入力しているグリッドの下書き: 枠（`draft.ts` の `Draft`）に、クイック入力の状態と、予定・タスクで違う
 * 日時の扱い（`DraftOps`）を足したもの。枠の形と計算は `draft.ts`、扱いの中身は予定が `event-draft.ts`・
 * タスクが `task-draft.ts` に置く。ここは型と種類の判定だけを持ち、それらを読まない（依存は一方向）。
 */

/**
 * グリッドに出している下書き（`Draft`）と、それを入力するクイック入力の状態（`use-event-composer.ts` が持つ）。
 * 追加しようとしている予定・タスクと、長押しでつまんで直している予定・タスク（item）の両方。
 */
export type GridDraft = Draft & {
  /**
   * タスクとして入力しているときの、枠を動かす元になる日時（`TaskTimes`）。予定なら null。
   * 何の枠か（`draftKind`）はこれだけで決まる（種類を別に持つと、種類と日時が食い違いうる）。
   * 直している物（item）の種類とは限らない（クイック入力の上端で切り替えられる）。
   * 予定の日時は枠（range）そのものが持つ。
   */
  task: TaskTimes | null;
  /** 選んでいる参加者。枠の色もこれで決まるので、入力（クイック入力）とグリッドで同じ物を見る */
  participantIds: string[];
  /**
   * なぞり終えたか。なぞっている間は PC の吹き出しを出さず（枠に重なって選べなくなる）、
   * グリッドも枠を追いかけてスクロールしない（指の下でグリッドが動くと狙いがずれる）
   */
  settled: boolean;
  /**
   * 入力をどこから始めたか（グリッドをなぞった・追加ボタン）。開く段とタイトルに焦点を当てるかがこれで決まる。
   * 見た目の結果（段）ではなく入口を持つのは、段と焦点がどちらも入口から決まる別々の事柄だから
   */
  origin: 'grid' | 'add';
};

/**
 * 入力で直した日時の下書きへの映し戻し。予定は枠、タスクは枠を動かす元の日時（`TaskTimes`。開始の所の枠
 * `frame` ごと）。直している物（item）は変わらない
 */
export type DraftChange = { range: DraftRange } | { task: TaskTimes };

/**
 * 下書きの種類ごとの扱い（予定は `eventDraftOps`、タスクは `taskDraftOps`）。クイック入力（`useQuickForm`）は
 * 種類で分岐せず、下書きに合ったこれを使う。
 * WHY 種類ごとにまとめる: 予定とタスクで違うのは日時の持ち方（予定は枠そのもの、タスクは枠を動かす元の日時）
 * だけで、その違いがここに閉じていれば、入れ物もフックも 1 つのまま種類を切り替えられる。
 */
export type DraftOps = {
  /** 入力の既定値（日時と、直している物から持ち越す残りの項目。参加者は呼び出し側が重ねる） */
  values: ItemFormValues;
  /** 下の段（PC は吹き出し）に出す日時の見出し */
  rangeText: string;
  /** 入力欄で直した日時 → 下書きへの映し戻し。枠に置けない（範囲に出せない・開始が空）なら null */
  fromInput: (input: WhenInput) => DraftChange | null;
  /** 終日の切り替え。入力欄で直していた日時（読めなければ null）を保ったまま切り替える */
  withAllDay: (input: WhenInput | null, allDay: boolean) => DraftChange;
};

/** 下書きが何の枠か。タスクの枠は長さを持たず、端をつまめない（`hasEnds`） */
export function draftKind(draft: Pick<GridDraft, 'task'>): EventKind {
  return draft.task ? 'task' : 'event';
}

/**
 * グリッドの枠で動かすタスクの日時（開始と、終日か）と、その日時が置かれていた枠（frame）。
 * 枠を動かすと、落とした所が開始になる（`taskTimesAt`）。
 * 保存済みのタスクをつまんだときはそのタスクの日時（`taskTimesOf`）、予定から切り替えたときや
 * 追加するときは枠の開始（`newTaskTimes`）、入力で直したときは入力した日時（`taskDraftFromInput`）から始める。
 * WHY 下書きの item（直しているタスク）とは別に持つ: item は保存の宛先で、追加や予定から切り替えたタスクには無い。
 */
export type TaskTimes = Pick<ItemFormValues, 'allDay' | 'startsAt'> & { frame: DraftRange };
