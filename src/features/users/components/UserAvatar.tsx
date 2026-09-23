import Avatar from '@mui/material/Avatar';
import { hueColor } from '../../../../shared/color.ts';
import { useColorMode } from '../../../lib/theme.ts';

type Props = {
  name: string;
  /** 色相。ユーザーの色（`hue`）をそのまま渡す */
  hue: number;
};

/**
 * ユーザーの丸いアイコン。名前の頭文字を、そのユーザーの色（カレンダーの帯と同じ `fill`）で塗る。
 * ユーザーを一覧で選ぶときも、自分の色を決めるときも同じ見た目にする。
 */
export function UserAvatar({ name, hue }: Props) {
  const mode = useColorMode();
  return (
    <Avatar sx={{ bgcolor: hueColor(hue, 'fill', mode), color: hueColor(hue, 'onFill', mode) }}>
      {name.slice(0, 1)}
    </Avatar>
  );
}
