import { useState } from 'react';

/** 開いているか閉じているかだけの画面の状態（追加のフォームなど）。開け閉めの関数を名前で渡せるようにする */
export function useToggle(initial = false) {
  const [value, setValue] = useState(initial);
  return { value, on: () => setValue(true), off: () => setValue(false) };
}

/** 値を持って開く画面の状態（開くときに初期値を渡すフォームなど）。閉じているときは null */
export function useOpenWith<T>() {
  const [value, setValue] = useState<T | null>(null);
  return { value, open: (next: T) => setValue(next), close: () => setValue(null) };
}
