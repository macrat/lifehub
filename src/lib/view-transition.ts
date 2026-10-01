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
