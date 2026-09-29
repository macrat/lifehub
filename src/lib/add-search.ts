import { useEffect, useRef } from 'react';
import { z } from 'zod';
import { ADD_PAGES, type AddKind, type AddPage } from './add-pages.ts';
import { usePatchSearch } from './search.ts';

/**
 * 入力を開いて始めるしるし（`add`）。PWA のショートカット（`src/lib/shortcuts.ts`）が URL に付ける。
 * 値は開く物の種類で、受け取れる種類は画面ごとに `ADD_PAGES` が決める。
 * 絞り込みのような画面の状態ではないので、受け取った画面が開くと同時に消す（`useAddShortcut`）。
 * 追加の入力を持つ画面（ホーム・カレンダー・立替・レモン）がそれぞれ読むので、どの機能にも属さない
 * `src/lib` に置く（ショートカットの URL を作る `shortcuts.ts` も同じ表 `ADD_PAGES` から作る）。
 */
export const addSearchSchema = <P extends AddPage>(page: P) => z.enum(ADD_PAGES[page]).optional();

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
): void {
  const patchSearch = usePatchSearch();
  const latest = useRef(open);
  latest.current = open;

  useEffect(() => {
    if (kind === undefined) return;
    latest.current(kind);
    patchSearch({ add: undefined }, { replace: true });
  }, [kind, patchSearch]);
}
