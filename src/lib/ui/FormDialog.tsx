import CloseIcon from '@mui/icons-material/Close';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import type { FormEvent, ReactNode } from 'react';
import { useIsMobile } from './use-breakpoint.ts';

type Props = {
  title: string;
  /** 右下の操作（キャンセル・保存）。スマホでは画面下に固定する */
  actions: ReactNode;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  maxWidth?: 'xs' | 'sm';
  children: ReactNode;
};

/**
 * 入力フォーム用のダイアログ。<form> を含み、Enter で送信できる。常に開いた状態で描画し、呼び出し側が条件付きでマウントする（閉じたら状態も消える）。
 * スマホでは全画面にして閉じるボタンを見出しに置き、操作ボタンを下端に固定する（キーボード表示時も届くように）。
 */
export function FormDialog({
  title,
  actions,
  onClose,
  onSubmit,
  maxWidth = 'sm',
  children,
}: Props) {
  const isMobile = useIsMobile();
  return (
    <Dialog open onClose={onClose} fullScreen={isMobile} fullWidth maxWidth={maxWidth}>
      <form onSubmit={onSubmit} noValidate style={{ display: 'contents' }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
          <span style={{ flexGrow: 1 }}>{title}</span>
          {isMobile && (
            <IconButton aria-label="閉じる" onClick={onClose} edge="end">
              <CloseIcon />
            </IconButton>
          )}
        </DialogTitle>
        <DialogContent>{children}</DialogContent>
        <DialogActions
          sx={{
            position: 'sticky',
            bottom: 0,
            bgcolor: 'background.paper',
            borderTop: 1,
            borderColor: 'divider',
            pb: 'calc(8px + env(safe-area-inset-bottom))',
          }}
        >
          {actions}
        </DialogActions>
      </form>
    </Dialog>
  );
}
