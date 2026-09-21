import MuiDialog from '@mui/material/Dialog';
import type { ComponentProps } from 'react';
import { useDialogHistory } from './dialog-history.ts';

type Props = Omit<ComponentProps<typeof MuiDialog>, 'onClose'> & {
  /** 閉じる操作（背景のクリック、Esc、ブラウザバック）。このダイアログのマウントをやめること */
  onClose: () => void;
};

/**
 * アプリのダイアログ。MUI の Dialog に、開いている間だけ履歴に項目を持つ振る舞いを足したもの
 * （`useDialogHistory`）。ダイアログは必ずこれを使う（MUI の Dialog を直接使うことは biome が禁じる）。
 */
export function Dialog({ onClose, ...props }: Props) {
  useDialogHistory(onClose);
  return <MuiDialog onClose={onClose} {...props} />;
}
