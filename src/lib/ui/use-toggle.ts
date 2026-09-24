import { useCallback, useState } from 'react';

/**
 * 開いているか閉じているかだけの画面の状態（追加のフォーム、絞り込みのパネル、ダイアログ）。
 * 開け閉めの関数は固定する（部品に渡しても、同一性で描き直しを省く部品の邪魔をしない）。
 */
export function useToggle() {
  const [value, setValue] = useState(false);
  return {
    value,
    on: useCallback(() => setValue(true), []),
    off: useCallback(() => setValue(false), []),
    toggle: useCallback(() => setValue((v) => !v), []),
  };
}

/** 値を持って開く画面の状態（開くときに初期値や対象を渡すフォームなど）。閉じているときは null */
export function useOpenWith<T>() {
  const [value, setValue] = useState<T | null>(null);
  return {
    value,
    open: useCallback((next: T) => setValue(next), []),
    close: useCallback(() => setValue(null), []),
  };
}
