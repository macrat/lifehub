import { useMemo } from 'react';
import { type ColorMode, hueColor } from '../../../shared/color.ts';
import { useColorMode } from '../../lib/theme.ts';
import { NO_USERS, useUsers } from './queries.ts';

export type ItemColors = {
  /** 帯などの面の色。上に載せる文字は `FILL_TEXT` */
  fill: string;
  /** 無地の面の上の細い線・小さな印の色（チェックボックス、下書きの枠など） */
  line: string;
  /** 一覧の左の印（`VennMark`）の色 */
  mark: string;
  /** 薄い背景（タイムラインのタスクなど） */
  tint: string;
};

/**
 * 色相と表示モードから出した色。一度出したら使い回す。
 * WHY: 答えはユーザー（2 人）と共有の 3 通りしか無いのに、呼ぶ側は一覧の行ごと・予定ごとに
 * 呼ぶ。OKLCH → sRGB の変換は色域に収まるまで繰り返すので 1 回が安くない。
 * 色相と表示モードだけで決まる値なので、古くなることは無い（色を変えれば別の鍵になる）。
 */
const cache = new Map<string, ItemColors>();

function colorsOf(hue: number | null, mode: ColorMode): ItemColors {
  const key = `${mode}:${hue}`;
  const known = cache.get(key);
  if (known) return known;
  const colors: ItemColors = {
    fill: hueColor(hue, 'fill', mode),
    line: hueColor(hue, 'line', mode),
    mark: hueColor(hue, 'mark', mode),
    tint: hueColor(hue, 'tint', mode),
  };
  cache.set(key, colors);
  return colors;
}

/**
 * ユーザーから表示色を返す。ユーザーが決まらない共有の項目（参加者が 1 人でない）は色相を持たない無彩色。
 * 表示モード（ライト／ダーク）ごとに明度・彩度を変える。
 */
export function useUserColor(): (userId: string | null) => ItemColors {
  const { data: users = NO_USERS } = useUsers();
  const mode = useColorMode();
  return useMemo(
    () => (userId: string | null) =>
      colorsOf(users.find((u) => u.id === userId)?.hue ?? null, mode),
    [users, mode],
  );
}
