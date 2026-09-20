import { useEffect, useState } from 'react';

/** 現在時刻。一定間隔で更新する（現在時刻の線など、時計に追従したい表示に使う） */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
