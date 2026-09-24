import { useCallback, useEffect, useRef } from 'react';

/**
 * 少し遅れて呼ぶ処理を予約する。消えた部品の予約は取り消す（消えた後に onClose などが遅れて届き、
 * その間に開いた別のものを閉じてしまわないように）。予約し直すと前の予約は取り消す。
 */
export function useTimeout(): (callback: () => void, ms: number) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return useCallback((callback, ms) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(callback, ms);
  }, []);
}
