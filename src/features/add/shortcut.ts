import { useNavigate, useRouter } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { z } from 'zod';
import { isDialogEntry } from '../../lib/ui/dialog-history.ts';
import type { AddKind } from './kinds.ts';

/**
 * 入力を開いて始めるしるし（`add`）。PWA のショートカット（`src/lib/shortcuts.ts`）が URL に付ける。
 * 値は開く物の種類で、画面ごとに受け取れる種類を渡す。
 * 絞り込みのような画面の状態ではないので、受け取った画面が開くと同時に消す（`useAddShortcut`）。
 */
export const addSearchSchema = <K extends AddKind>(...kinds: [K, ...K[]]) =>
  z.enum(kinds).optional();

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
  const navigate = useNavigate();
  const router = useRouter();
  const latest = useRef(open);
  latest.current = open;
  // 別の画面の追加ボタンから来たか（入力を閉じると、その画面へ戻る）
  const leavesOnClose = useRef(false);

  useEffect(() => {
    if (kind === undefined) return;
    leavesOnClose.current = isDialogEntry(router.history.location.state);
    latest.current(kind);
    navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => ({ ...prev, add: undefined }),
      replace: true,
      // 履歴の state（`asDialogEntry` の印）は残す
      state: true,
      // 一覧のスクロール位置に触らない（開いた直後に先頭へ飛ばさない）
      resetScroll: false,
    });
  }, [kind, navigate, router]);

  /**
   * 返すのは、開いた入力を閉じた（保存でも取り消しでも）ときに呼ぶ関数。別の画面の追加ボタンから
   * 来ていれば true。その画面へは入力のマウントが終わると同時に戻る（`asDialogEntry`）ので、
   * 呼び出し側は表示を元に戻さなくてよい（戻す様子が一瞬見えてしまう）。
   */
  return () => {
    const leaves = leavesOnClose.current;
    leavesOnClose.current = false;
    return leaves;
  };
}
