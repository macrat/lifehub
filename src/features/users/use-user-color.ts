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
 * 項目の所有者（予定の ownerUserId / タスクの assigneeUserId）から表示色を返す。
 * 共有（null）はアプリ既定の色相。表示モード（ライト／ダーク）ごとに明度・彩度を変える。
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
