import { useQuery } from '@tanstack/react-query';
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
 */
export function useUserColor(): (userId: string | null) => ItemColors {
  const { data: users = [] } = useQuery(usersQueryOptions);
  const mode = useColorMode();
  return (userId: string | null) => {
    const hue = users.find((u) => u.id === userId)?.hue ?? null;
    return {
      fill: hueColor(hue, 'fill', mode),
      text: fillContrastText(mode),
      tint: hueColor(hue, 'tint', mode),
    };
  };
}
