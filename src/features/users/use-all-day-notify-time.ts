import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DEFAULT_ALL_DAY_NOTIFY_MINUTES } from '../../../shared/constants.ts';
import { meQueryOptions } from '../../lib/auth.ts';
import { formatMinutesOfDay, parseMinutesOfDay } from '../../lib/date.ts';
import { useUpdateUser } from './queries.ts';

/**
 * 設定画面の「終日の予定・タスクの通知時刻」。選んでいる時刻（`<input type="time">` の値）は
 * 保存ボタンを押すまで手元に置き、押したら自分の設定として保存する。
 * 保存すると楽観的更新で `me` が先に変わるので、押した時点で保存済みの時刻と同じになる。
 */
export function useAllDayNotifyTime() {
  const { data: me } = useQuery(meQueryOptions);
  const update = useUpdateUser();
  const saved = formatMinutesOfDay(me?.allDayNotifyMinutes ?? DEFAULT_ALL_DAY_NOTIFY_MINUTES);
  const [picked, setPicked] = useState<string | null>(null);
  const value = picked ?? saved;
  return {
    value,
    /** 空欄（入力の途中で消した）は保存できない */
    changed: me != null && value !== '' && value !== saved,
    pick: setPicked,
    save: () => {
      if (!me || value === '') return;
      update.mutate({ id: me.id, allDayNotifyMinutes: parseMinutesOfDay(value) });
      setPicked(null);
    },
  };
}
