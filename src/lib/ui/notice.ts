import { createStore } from '../store.ts';

/**
 * 知らせの種類。見た目（色とアイコン）はこれで決まる。
 * - info: 操作が済んだことを伝えるだけ（コピーしました など）。アクセントカラーで出す。
 * - error: 失敗を伝える。赤で出す。
 * WHY: 種類を省略できると、ただの知らせが警告の見た目で出てしまう。呼ぶ側に必ず選ばせる。
 */
type NoticeSeverity = 'info' | 'error';

/** 知らせを出しておく長さの既定（ms）。読んで意味を取れるだけの長さ */
const DEFAULT_DURATION = 8000;

type Notice = {
  severity: NoticeSeverity;
  message: string;
  /** 出しておく長さ（ms） */
  duration: number;
  open: boolean;
};

/**
 * 画面の下部に出す短い知らせ（保存の失敗など）。フォームは送信と同時に閉じるので、
 * 送信の失敗はここで伝える。同時に 1 つだけ持ち、新しいものが前のものを置き換える。
 *
 * 閉じても種類と文言は残す。WHY: 閉じるアニメーションの間も同じ見た目のまま消えるようにするため
 * （消すと、閉じる途中で色や文言が変わって見える）。
 */
const [useNotice, setNotice] = createStore<Notice>({
  severity: 'info',
  message: '',
  duration: DEFAULT_DURATION,
  open: false,
});

export { useNotice };

/** 知らせを出す。duration は、一目で分かる短い知らせを早く消したいときだけ渡す */
export function notify(
  severity: NoticeSeverity,
  message: string,
  duration: number = DEFAULT_DURATION,
): void {
  setNotice({ severity, message, duration, open: true });
}

export function closeNotice(): void {
  setNotice((notice) => ({ ...notice, open: false }));
}
