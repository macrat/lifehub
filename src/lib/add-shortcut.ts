import { useEffect, useRef } from 'react';

/**
 * URL の `add`（PWA のショートカットや追加ボタンが付けるしるし）を受けて、入力を 1 度だけ開く。
 * 開くのと同時にしるしを消す（`clear`）: 開いている入力は画面の状態であって URL に残す物ではなく
 * （`src/lib/ui/dialog-history.ts`）、残すと戻る・再読み込みのたびに開き直してしまうため。
 *
 * `open` と `clear` は毎描画で作り直してよい（最新の物を ref から呼ぶので、しるしが変わるまで再実行しない）。
 */
export function useAddShortcut<K extends string>(
  kind: K | undefined,
  open: (kind: K) => void,
  clear: () => void,
): void {
  const latest = useRef({ open, clear });
  latest.current = { open, clear };

  useEffect(() => {
    if (kind === undefined) return;
    latest.current.open(kind);
    latest.current.clear();
  }, [kind]);
}
