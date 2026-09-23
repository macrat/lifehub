import { useNavigate, useRouter } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { ADD_PAGES, type AddKind, type AddPage } from './add-pages.ts';
import { usePatchSearch } from './search.ts';
import { traverseTo } from './ui/dialog-history.ts';

/**
 * 入力を開いて始めるしるし（`add`）。PWA のショートカット（`src/lib/shortcuts.ts`）が URL に付ける。
 * 値は開く物の種類で、受け取れる種類は画面ごとに `ADD_PAGES` が決める。
 * 絞り込みのような画面の状態ではないので、受け取った画面が開くと同時に消す（`useAddShortcut`）。
 * 追加のフォームを持つ機能（予定・立替・レモン）がそれぞれ読むので、どの機能にも属さない
 * `src/lib` に置く（機能から `features/add` を読むと、機能のフォームを読む `features/add` と輪になる）。
 */
export const addSearchSchema = (page: AddPage) => z.enum(ADD_PAGES[page]).optional();

/**
 * 別の画面の追加ボタンから来た印（履歴の state）。入力を閉じたら、来る前の画面（来たときの 1 つ前の
 * 履歴の項目）へ戻す。入力中に画面の中で移動して履歴を積んでいても、それごと越えて戻る（`traverseTo`）。
 * URL ではなく履歴に持つ: 「どこから来たか」は履歴の並びのことで、PWA のショートカット
 * （前の画面が無い）や再読み込みでは戻り先が無いので、付かないほうが正しい。
 */
type ReturnState = { returnOnClose?: boolean };
const RETURN_ON_CLOSE: ReturnState = { returnOnClose: true };

/**
 * ほかの画面（ホーム）の追加ボタンから予定の入力を始める。選んだ時間帯を見ながら入れたいので、
 * 今日の下書きを置きにカレンダーへ送り（カレンダー画面の `add`）、入力を閉じたらこの画面へ戻す
 * （`RETURN_ON_CLOSE`）。
 */
export function useAddEventOnCalendar(): () => void {
  const navigate = useNavigate();
  return () =>
    navigate({
      to: '/calendar',
      search: { add: 'event' },
      state: (prev) => ({ ...prev, ...RETURN_ON_CLOSE }),
    });
}

/**
 * しるしを受けて入力を 1 度だけ開く。開くのと同時にしるしを URL から消すので、
 * 戻る・再読み込みで開き直さない（開いている入力は画面の状態で、URL に残す物ではない。
 * `src/lib/ui/dialog-history.ts`）。消すのは置き換えで、履歴には積まない。
 *
 * `open` は毎描画で作り直してよい（最新の物を ref から呼ぶので、しるしが変わるまで再実行しない）。
 */
export function useAddShortcut<K extends AddKind>(
  kind: K | undefined,
  open: (kind: K) => void,
): () => boolean {
  const patchSearch = usePatchSearch();
  const router = useRouter();
  const latest = useRef(open);
  latest.current = open;
  // 戻り先（来る前の画面の履歴の位置）。別の画面の追加ボタンから来たときだけある
  const returnIndex = useRef<number | null>(null);
  const [leaving, setLeaving] = useState<number | null>(null);

  // 戻るのは入力のマウントが終わってから（その項目が履歴から消えてから渡る。`traverseTo`）
  useEffect(() => {
    if (leaving !== null) traverseTo(router, leaving);
  }, [leaving, router]);

  useEffect(() => {
    if (kind === undefined) return;
    const { state } = router.history.location;
    returnIndex.current = (state as ReturnState).returnOnClose ? state.__TSR_index - 1 : null;
    latest.current(kind);
    patchSearch({ add: undefined }, { replace: true });
  }, [kind, patchSearch, router]);

  /**
   * 返すのは、開いた入力を閉じた（保存でも取り消しでも）ときに呼ぶ関数。別の画面の追加ボタンから
   * 来ていれば、その画面へ戻して true。true なら画面は離れるので、呼び出し側は表示を元に戻さなくてよい
   * （戻す様子が一瞬見えてしまう）。
   */
  return () => {
    const index = returnIndex.current;
    returnIndex.current = null;
    if (index === null) return false;
    setLeaving(index);
    return true;
  };
}
