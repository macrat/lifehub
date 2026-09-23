import { useCallback, useReducer } from 'react';
import type { DateString } from '../../../shared/types.ts';
import type { SheetDetent } from '../../lib/ui/BottomSheet.tsx';
import { defaultParticipants, type ItemFormValues } from '../events/form-values.ts';
import { type CreateEventBody, useCreateEvent, useUpdateEvent } from '../events/queries.ts';
import { grabbedScope, writeTarget } from '../events/recurrence-options.ts';
import { type Draft, defaultDraft, type EventDraft, sameOccurrence } from './draft.ts';
import type { CalendarItem } from './queries.ts';

/**
 * グリッドに出している下書き（`Draft`）と、それを入力するクイック入力の状態。
 * 追加しようとしている予定と、長押しでつまんで直している予定（item）の両方。
 */
export type GridDraft = Draft & {
  /** 選んでいる参加者。枠の色もこれで決まるので、入力（クイック入力）とグリッドで同じ物を見る */
  participantIds: string[];
  /**
   * なぞり終えたか。なぞっている間は PC の吹き出しを出さず（枠に重なって選べなくなる）、
   * グリッドも枠を追いかけてスクロールしない（指の下でグリッドが動くと狙いがずれる）
   */
  settled: boolean;
  /** 入力を開く段。グリッドからは下の段、追加ボタンからは全項目の段 */
  detent: SheetDetent;
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
      /** 直している予定（追加なら null）。保存の宛先がこれで決まる */
      item: CalendarItem | null;
    };

type ComposerAction =
  /**
   * グリッドをなぞって範囲を決めた（done は指を離したか）。participantIds は新しい予定の既定の参加者。
   * 同じ予定を直し続けている間は選んだ参加者をそのまま持ち越す（枠を動かすたびに色と選択が戻らない）。
   * つまむ物が変わったときは、直す予定の参加者（追加なら既定）から始める
   */
  | { type: 'grab'; draft: Draft; done: boolean; participantIds: string[] }
  /** 追加ボタンからの予定の入力。既定の時間帯の下書きを置き、入力を全項目の段で開く */
  | { type: 'start'; range: EventDraft; participantIds: string[] }
  /** クイック入力で直した日時・終日の切り替えを下書きへ戻す */
  | { type: 'change'; range: EventDraft }
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
      return {
        mode: 'grid',
        ...draft,
        participantIds: keep
          ? state.participantIds
          : (draft.item?.participantIds ?? action.participantIds),
        settled: done,
        detent: 'peek',
      };
    }
    case 'start':
      return {
        mode: 'grid',
        range: action.range,
        item: null,
        participantIds: action.participantIds,
        settled: true,
        detent: 'full',
      };
    case 'change':
      return state?.mode === 'grid' ? { ...state, range: action.range, settled: true } : state;
    case 'participants':
      return state?.mode === 'grid' ? { ...state, participantIds: action.participantIds } : state;
    case 'expand':
      return state?.mode === 'grid'
        ? { mode: 'form', values: action.values, item: state.item }
        : state;
    case 'close':
      return null;
  }
}

/**
 * カレンダー画面の予定の入力（グリッドの下書き → クイック入力 →「その他のオプション」の全項目のフォーム）。
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
    /** 追加ボタンからの予定の入力。下書きを置く日は今見ている日 */
    start: (date: DateString) =>
      dispatch({
        type: 'start',
        range: defaultDraft(date),
        participantIds: defaultParticipants(meId),
      }),
    changeRange: (range: EventDraft) => dispatch({ type: 'change', range }),
    changeParticipants: (participantIds: string[]) =>
      dispatch({ type: 'participants', participantIds }),
    expand: (values: ItemFormValues) => dispatch({ type: 'expand', values }),
    close: () => dispatch({ type: 'close' }),
    /**
     * 保存。つまんだ予定を直しているときはその予定を上書きし、そうでなければ追加する
     * （クイック入力からでも全項目のフォームからでも同じ）。繰り返しの回はその回だけ（`grabbedScope`）。
     */
    save: (input: CreateEventBody) => {
      const item = state?.item ?? null;
      if (!item) return createEvent.mutateAsync(input);
      return updateEvent.mutateAsync({ ...input, ...writeTarget(item, grabbedScope(item)) });
    },
  };
}
