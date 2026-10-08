import { type MouseEvent, useState } from 'react';
import { afterDialogClosed } from './dialog-history.ts';

/**
 * 操作のメニュー（`ActionMenu`）の開け閉め。押したボタンに寄せて開き、項目を選ぶと閉じてから操作する。
 * 開いている間は履歴に項目を持つ（`ActionMenu` が開いている間だけ `useDialogHistory` を呼ぶ部品を描く）ので、
 * 戻る操作ではメニューだけが閉じる。
 * 項目の操作はメニューの項目を履歴から戻し終えてから行う（`afterDialogClosed`。表示の切替のように
 * 画面を移る操作が、メニューの項目の後ろに積まれないように）。
 */
export function useActionMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);
  return {
    anchor,
    open: (event: MouseEvent<HTMLElement>) => setAnchor(event.currentTarget),
    close,
    /** 項目を選んだとき。メニューを閉じ、その履歴の項目を戻し終えてから操作する */
    select: (onClick: () => void) => {
      close();
      afterDialogClosed(onClick);
    },
  };
}
