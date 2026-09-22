import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fillContrastText, hueColor } from '../../../shared/color.ts';
import { useColorMode } from '../../lib/theme.ts';
import { usersQueryOptions } from './queries.ts';

export type ItemColors = {
  /** 帯・点・チェックボックスの色 */
  fill: string;
  /** fill の上に載せる文字色 */
  text: string;
  /** 薄い背景（タイムラインのタスクなど） */
  tint: string;
};

/**
 * ユーザーから表示色を返す。ユーザーが決まらない共有の項目（参加者が 1 人でない）は色相を持たない無彩色。
 * 表示モード（ライト／ダーク）ごとに明度・彩度を変える。
 *
 * 答えはユーザー（2 人）と共有の 3 通りしか無いのに、呼ぶ側は一覧の行ごと・予定ごとに
 * 呼ぶので、一度出した色は覚えておく（OKLCH → sRGB の変換は色域に収めるまで繰り返すため
 * 1 回が安くない）。ユーザーか表示モードが変われば作り直す。
 */
export function useUserColor(): (userId: string | null) => ItemColors {
  const { data: users = [] } = useQuery(usersQueryOptions);
  const mode = useColorMode();
  return useMemo(() => {
    const cache = new Map<string | null, ItemColors>();
    return (userId: string | null) => {
      const known = cache.get(userId);
      if (known) return known;
      const hue = users.find((u) => u.id === userId)?.hue ?? null;
      const colors = {
        fill: hueColor(hue, 'fill', mode),
        text: fillContrastText(mode),
        tint: hueColor(hue, 'tint', mode),
      };
      cache.set(userId, colors);
      return colors;
    };
  }, [users, mode]);
}
