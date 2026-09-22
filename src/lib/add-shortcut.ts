import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { z } from 'zod';

/**
 * 入力を開いて始めるしるし（`add`）。PWA のショートカット（manifest の `shortcuts`。`vite.config.ts`）が
 * URL に付ける。値は開く物の種類で、画面ごとに受け取れる種類を渡す。
 * 絞り込みのような画面の状態ではないので、受け取った画面が開くと同時に消す（`useAddShortcut`）。
 */
export const addSearchSchema = <K extends string>(...kinds: [K, ...K[]]) =>
  z.enum(kinds).optional();

/**
 * しるしを受けて入力を 1 度だけ開く。開くのと同時にしるしを URL から消すので、
 * 戻る・再読み込みで開き直さない（開いている入力は画面の状態で、URL に残す物ではない。
 * `src/lib/ui/dialog-history.ts`）。消すのは置き換えで、履歴には積まない。
 *
 * `open` は毎描画で作り直してよい（最新の物を ref から呼ぶので、しるしが変わるまで再実行しない）。
 */
export function useAddShortcut<K extends string>(
  kind: K | undefined,
  open: (kind: K) => void,
): void {
  const navigate = useNavigate();
  const latest = useRef(open);
  latest.current = open;

  useEffect(() => {
    if (kind === undefined) return;
    latest.current(kind);
    navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => ({ ...prev, add: undefined }),
      replace: true,
      // 一覧のスクロール位置に触らない（開いた直後に先頭へ飛ばさない）
      resetScroll: false,
    });
  }, [kind, navigate]);
}
