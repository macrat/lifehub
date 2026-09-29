import { useState } from 'react';
import { DEFAULT_ALL_DAY_NOTIFY_MINUTES } from '../../../shared/constants.ts';
import { meQueryOptions } from '../../lib/auth.ts';
import { formatMinutesOfDay } from '../../lib/date.ts';
import { useStoreQuery } from '../../lib/screen-data.ts';
import { useUpdateUser } from './queries.ts';

/**
 * 設定画面の「終日の予定・タスクの通知時刻」。選んでいる時刻は保存ボタンを押すまで手元に置き、
 * 押したら自分の設定として保存する。保存すると楽観的更新で `me` が先に変わるので、押した時点で
 * 保存済みの時刻と同じになる。
 *
 * 入力欄の文字列（`value`）と、それが指す 0:00 からの分を組で持つ。文字列は入力の途中（消した・書きかけ）も
 * そのまま出すため。分はブラウザの解釈（`valueAsNumber` は 0:00 からのミリ秒）から求め、自前で解析しない。
 * `me` の通知時刻が無いのは、この項目ができる前に端末へ永続化された `me` を読んだとき（取り直せば入る）。
 */
export function useAllDayNotifyTime() {
  const { data: me } = useStoreQuery(meQueryOptions);
  const update = useUpdateUser();
  const savedMinutes = me?.allDayNotifyMinutes ?? DEFAULT_ALL_DAY_NOTIFY_MINUTES;
  const [picked, setPicked] = useState<{ value: string; minutes: number } | null>(null);
  const minutes = picked?.minutes ?? savedMinutes;
  return {
    value: picked?.value ?? formatMinutesOfDay(savedMinutes),
    /** 空欄・書きかけ（分が NaN）は保存できない */
    changed: me != null && !Number.isNaN(minutes) && minutes !== savedMinutes,
    pick: (input: HTMLInputElement) =>
      setPicked({ value: input.value, minutes: input.valueAsNumber / 60_000 }),
    save: () => {
      if (!me) return;
      update.mutate({ id: me.id, allDayNotifyMinutes: minutes });
      setPicked(null);
    },
  };
}
