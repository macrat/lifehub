import { useCallback, useReducer } from 'react';
import type { CalendarItem } from '../../../shared/calendar.ts';
import type { DateString } from '../../../shared/types.ts';
import type { EventKind } from '../../../shared/validation/events.ts';
import { defaultParticipants, type ItemFormValues } from '../events/form-values.ts';
import { type CreateEventBody, useCreateEvent, useUpdateEvent } from '../events/queries.ts';
import { grabbedScope, writeTarget } from '../events/recurrence-options.ts';
import {
  allDayDraft,
  type Draft,
  type DraftChange,
  type DraftRange,
  draftKind,
  type GridDraft,
  sameOccurrence,
  toEventRange,
  toTaskFrame,
} from './draft.ts';
import { newTaskTimes, taskTimesOf } from './task-draft.ts';

/** クイック入力（`QuickItemForm`）が呼び出し側から受け取るもの。予定とタスクで同じ */
export type QuickProps = {
  /**
   * グリッドの下書き。`item` は直している保存済みの予定・タスク（長押しでつまんだもの。追加のときは null）で、
   * 入力の既定値になり、保存は呼び出し側（`onSubmit`）が上書きに振り分ける。
   */
  draft: GridDraft;
  onChangeParticipants: (participantIds: string[]) => void;
  /** 検証を通った値の保存。結果は待つが、画面には楽観的更新で先に反映されている */
  onSubmit: (input: CreateEventBody) => Promise<unknown>;
  /** 上の段で直した日時を下書き（グリッドの枠とタスクの日時）へ戻す */
  onChangeDraft: (change: DraftChange) => void;
  /** 予定・タスクの切り替え（上端の `KindToggle`）。引き継ぐのは開始だけ */
  onSwitchKind: (kind: EventKind) => void;
  /** PC の「その他のオプション」: 入力済みの内容を引き継いで全項目のフォームへ */
  onExpand: (values: ItemFormValues) => void;
  onClose: () => void;
  /** シートがカレンダーを下から覆っている高さ（px）が変わったとき */
  onChangeInset: (inset: number) => void;
};

/**
 * 予定の入力。無い・グリッドの下書きとクイック入力・全項目のフォーム（「その他のオプション」で移した後）の
 * どれか 1 つで、同時に 2 つは開かない（型がそれを守る）。
 */
type ComposerState =
  | null
  | ({ mode: 'grid' } & GridDraft)
  | {
      mode: 'form';
      /** クイック入力から持ち越した入力 */
      values: ItemFormValues;
      /** 直している予定・タスク（追加なら null）。保存の宛先がこれで決まる */
      item: CalendarItem | null;
      /** クイック入力で選んでいた種類 */
      kind: EventKind;
    };

type ComposerAction =
  /**
   * グリッドをなぞって範囲を決めた（done は指を離したか）。participantIds は新しい予定の既定の参加者。
   * 同じ予定を直し続けている間は選んだ参加者をそのまま持ち越す（枠を動かすたびに色と選択が戻らない）。
   * つまむ物が変わったときは、直す予定の参加者（追加なら既定）から始める
   */
  | { type: 'grab'; draft: Draft; done: boolean; participantIds: string[] }
  /**
   * 追加ボタン（とショートカット）からの入力。その日の終日の下書きを置き、入力を全項目の段で開く。
   * 種類はふだん予定で、タスクのショートカットからはタスク
   */
  | { type: 'start'; range: DraftRange; kind: EventKind; participantIds: string[] }
  /**
   * クイック入力で直した日時・終日の切り替えを下書きへ戻す。
   * 予定は枠だけが変わり、タスクは日時を枠から導くので、入力した日時（`task`）ごと持ち替える（`taskDraftFromInput`）
   */
  | ({ type: 'change' } & DraftChange)
  /** 予定・タスクの切り替え。枠をその種類の形にし、開始だけを引き継ぐ（`switchedKind`） */
  | { type: 'switchKind'; kind: EventKind }
  | { type: 'participants'; participantIds: string[] }
  /** 「その他のオプション」: 入力済みの内容と直している予定を全項目のフォームへ移す */
  | { type: 'expand'; values: ItemFormValues }
  /** 閉じた（保存でも取り消しでも） */
  | { type: 'close' };

/** 予定の入力の状態の移り変わり。変えるのはここだけ（ページはこれを呼ぶ操作を並べるだけ） */
export function composerReducer(state: ComposerState, action: ComposerAction): ComposerState {
  switch (action.type) {
    case 'grab': {
      const { draft, done } = action;
      const keep = state?.mode === 'grid' && sameOccurrence(state.item, draft.item);
      // 同じ物を直し続けている間は選んだ種類のまま（切り替えたタスクは、なぞり直してもタスク）
      const task = keep ? state.task : grabbedTask(draft);
      return {
        mode: 'grid',
        item: draft.item,
        task,
        // タスクの枠は長さを持たないので、なぞった範囲からでも開始の所のタスクの形にする（置いたタスクと同じ見た目）
        range: task ? toTaskFrame(draft.range) : draft.range,
        participantIds: keep
          ? state.participantIds
          : (draft.item?.participantIds ?? action.participantIds),
        settled: done,
        origin: 'grid',
      };
    }
    case 'start':
      return {
        mode: 'grid',
        item: null,
        ...switchedKind(action.range, action.kind),
        participantIds: action.participantIds,
        settled: true,
        origin: 'add',
      };
    case 'change':
      if (state?.mode !== 'grid') return state;
      return 'task' in action
        ? { ...state, task: action.task, range: action.task.frame, settled: true }
        : { ...state, range: action.range, settled: true };
    case 'switchKind':
      return state?.mode === 'grid' && draftKind(state) !== action.kind
        ? { ...state, ...switchedKind(state.range, action.kind) }
        : state;
    case 'participants':
      return state?.mode === 'grid' ? { ...state, participantIds: action.participantIds } : state;
    case 'expand':
      return state?.mode === 'grid'
        ? { mode: 'form', values: action.values, item: state.item, kind: draftKind(state) }
        : state;
    case 'close':
      return null;
  }
}

/** つまんだ物がタスクなら、枠を動かす元になるその日時。空いている所からの下書き・予定は null（予定） */
function grabbedTask({ item, range }: Draft): GridDraft['task'] {
  return item?.kind === 'task' ? taskTimesOf(item, range) : null;
}

/**
 * 枠 range を種類 kind の下書きにする（切り替え・追加の開始）。引き継ぐのは枠の開始だけ（全項目のフォームの
 * `switchKindValues`・MCP の `switchedKind` と同じ規則を枠の形にしたもの）: タスクへは開始の所に置いたタスク（`newTaskTimes`）、予定へは開始から 1 時間
 * （終日はその日。枠は日をまたげないので日の終わりで止める。`toEventRange`）。
 */
function switchedKind(range: DraftRange, kind: EventKind): Pick<GridDraft, 'task' | 'range'> {
  if (kind === 'event') return { task: null, range: toEventRange(range) };
  const task = newTaskTimes(range);
  return { task, range: task.frame };
}

/**
 * カレンダー画面の予定・タスクの入力（グリッドの下書き → クイック入力 →「その他のオプション」の全項目のフォーム）。
 * 予定もタスクも同じ流れで入力し、クイック入力の上端で種類を切り替えられる（入力の中身と枠の形が変わる）。
 * 状態は 1 つ（`ComposerState`）で、変えるのは `composerReducer` だけ。
 * 保存の宛先は直している予定だけで決まる: あれば上書き、無ければ追加（入口では変わらない）。
 */
export function useEventComposer(meId: string | null) {
  const [state, dispatch] = useReducer(composerReducer, null);
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  // 面（CalendarPane）に渡すので固定する（毎回別の関数だと面が描き直しを省けない）
  const grab = useCallback(
    (draft: Draft, done: boolean) =>
      dispatch({ type: 'grab', draft, done, participantIds: defaultParticipants(meId) }),
    [meId],
  );

  return {
    /** グリッドに出している下書き（クイック入力を開いている）。全項目のフォームへ移したら null */
    draft: state?.mode === 'grid' ? state : null,
    /** 全項目のフォームへ移した入力 */
    expanded: state?.mode === 'form' ? state : null,
    grab,
    /**
     * 追加ボタンからの入力。下書きは今見ている日の終日にする。追加ボタンからは時間帯を選んでいないので、
     * 決め打ちの時間帯を置くより日だけ決めておくほうが直す手間が少ない（時間帯を選びたいならグリッドをなぞる）。
     * 種類はふだん予定で、入力の上端でタスクに切り替えられる（タスクのショートカットからはタスクで始める）
     */
    start: (date: DateString, kind: EventKind = 'event') =>
      dispatch({
        type: 'start',
        range: allDayDraft(date),
        kind,
        participantIds: defaultParticipants(meId),
      }),
    changeDraft: (change: DraftChange) => dispatch({ type: 'change', ...change }),
    switchKind: (kind: EventKind) => dispatch({ type: 'switchKind', kind }),
    changeParticipants: (participantIds: string[]) =>
      dispatch({ type: 'participants', participantIds }),
    expand: (values: ItemFormValues) => dispatch({ type: 'expand', values }),
    close: () => dispatch({ type: 'close' }),
    /**
     * 保存。つまんだ予定・タスクを直しているときはそれを上書きし、そうでなければ追加する
     * （クイック入力からでも全項目のフォームからでも同じ）。繰り返しの回はその回だけ（`grabbedScope`）。
     */
    save: (input: CreateEventBody) => {
      const item = state?.item ?? null;
      if (!item) return createEvent.mutateAsync(input);
      return updateEvent.mutateAsync({ ...input, ...writeTarget(item, grabbedScope(item)) });
    },
  };
}
