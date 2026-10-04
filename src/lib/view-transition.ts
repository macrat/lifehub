import type { ParsedLocation } from '@tanstack/react-router';
import { createStore } from './store.ts';

/** 遷移の前後の場所 */
export type TransitionEnds = { from: ParsedLocation | undefined; to: ParsedLocation };

/**
 * いま始まる画面の移動の前後の場所。router が移動を始めるたびに（遷移の前後の画面が撮られるより前に）書く
 * （`src/main.tsx`）。どこからどこへの移動かで名前を付け分ける物（押した日の天気のアイコンなど）が読む。
 * WHY 移動の場所から導く: 押した所ごとに覚えておくと、書く所が入口の数だけ増え、戻る・進む・読み直しでは
 * 古い値が残る。移動の前後の場所は router がどの経路でも 1 か所で知っている。
 */
export const [useTransitionEnds, setTransitionEnds] = createStore<TransitionEnds | null>(null);

/** 場所の、判定に要る所だけ（ルーターの ParsedLocation の一部） */
type Place = Pick<ParsedLocation, 'pathname' | 'searchStr'>;

/** カレンダーの表示（月・週・日・リスト）。画面が変わったかの判定に使う */
const viewOf = ({ searchStr }: Place) => new URLSearchParams(searchStr).get('view');

/**
 * 移動を View Transition で繋ぐか（ルーターの `defaultViewTransition.types`。`src/main.tsx`）。
 * 画面が変わる移動は繋ぐ。前後の画面に共通して在るもの（docs/ui.md）は名前を合わせてあり、その場から動く。
 * 名前の無いものはフェードする。画面が変わるのはパスが変わるときと、カレンダーの表示が変わるとき。
 *
 * 同じ画面の中での更新（スワイプでの前後移動・今日へ、リストの絞り込み、検索キーワードの入力）では使わない。
 * 指やキーの動きに合わせて出る所なので、そのたびに画面全体がフェードすると却って遅く見える。
 * 最初の表示（移動元が無い）も繋がない。
 * 返す値は「遷移する（種別は付けない）」が `[]`、「遷移しない」が `false`。
 */
export function viewTransitionTypes({
  fromLocation,
  toLocation,
}: {
  fromLocation?: Place;
  toLocation: Place;
}): [] | false {
  return fromLocation !== undefined &&
    (fromLocation.pathname !== toLocation.pathname || viewOf(fromLocation) !== viewOf(toLocation))
    ? []
    : false;
}
