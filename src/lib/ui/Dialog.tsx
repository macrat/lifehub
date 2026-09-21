import MuiDialog from '@mui/material/Dialog';
import type { ComponentProps } from 'react';
import { useDialogHistory } from './dialog-history.ts';

type Props = Omit<
  ComponentProps<typeof MuiDialog>,
  'onClose' | 'aria-label' | 'aria-labelledby'
> & {
  /** 閉じる操作（背景のクリック、Esc、ブラウザバック）。このダイアログのマウントをやめること */
  onClose: () => void;
  /**
   * 読み上げ用の名前。何の場かを指す名詞にする（「年月の選択」「繰り返しの編集」）。
   * 見出しを出さないダイアログがあるので、名前は必ずここで与える。
   */
  label: string;
};

/**
 * アプリのダイアログ。MUI の Dialog に、開いている間だけ履歴に項目を持つ振る舞い（`useDialogHistory`）と、
 * 読み上げ用の名前を足したもの。ダイアログは必ずこれを使う（MUI の Dialog を直接使うことは biome が禁じる）。
 *
 * 名前を `aria-label` で与えるために、MUI が振る `aria-labelledby` は消す。MUI は見出し（`DialogTitle`）が
 * 無くても id を振るので、そのままだと指す先の無い参照が残って名前を失う。
 */
export function Dialog({ onClose, label, slotProps, ...props }: Props) {
  useDialogHistory(onClose);
  return (
    <MuiDialog
      onClose={onClose}
      {...props}
      slotProps={{
        ...slotProps,
        paper: { ...slotProps?.paper, 'aria-label': label, 'aria-labelledby': undefined },
      }}
    />
  );
}
