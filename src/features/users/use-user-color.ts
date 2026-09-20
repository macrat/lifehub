import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { DEFAULT_HUE, fillContrastText, hueColor } from '../../../shared/color.ts';
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
 * ユーザーから表示色を返す。null（参加者が複数の項目）はアプリ既定の色相。表示モード（ライト／ダーク）ごとに明度・彩度を変える。
 */
export function useUserColor(): (userId: string | null) => ItemColors {
  const { data: users = [] } = useQuery(usersQueryOptions);
  const mode = useColorMode();
  return useCallback(
    (userId: string | null) => {
      const hue = users.find((u) => u.id === userId)?.hue ?? DEFAULT_HUE;
      return {
        fill: hueColor(hue, 'fill', mode),
        text: fillContrastText(mode),
        tint: hueColor(hue, 'tint', mode),
      };
    },
    [users, mode],
  );
}
