import Chip from '@mui/material/Chip';
import { FILL_TEXT } from '../../../../shared/color.ts';
import { useUserColor } from '../use-user-color.ts';
import { useUserLabels } from '../use-user-labels.ts';

type Props = {
  /** null は「共有」（立替の To・From）で、無彩色になる */
  userId: string | null;
  /** 名前の前に添える役割（立替の「To」「From」など） */
  prefix?: string;
};

/** 詳細に出す人のチップ。一覧やタイムラインの印と同じその人の色で塗り、誰のことかを色でも示す */
export function UserChip({ userId, prefix }: Props) {
  const { label } = useUserLabels();
  const colorFor = useUserColor();
  return (
    <Chip
      size="small"
      label={prefix ? `${prefix}: ${label(userId)}` : label(userId)}
      sx={{ bgcolor: colorFor(userId).fill, color: FILL_TEXT }}
    />
  );
}
