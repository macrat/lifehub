import { createStore } from '../store.ts';

/**
 * 画面の下部に出す短い知らせ（保存の失敗など）。フォームは送信と同時に閉じるので、
 * 送信の失敗はここで伝える。同時に 1 つだけ持ち、新しいものが前のものを置き換える。
 */
export const [useNotice, notify] = createStore<string | null>(null);
