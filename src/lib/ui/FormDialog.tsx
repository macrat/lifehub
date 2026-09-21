import CloseIcon from '@mui/icons-material/Close';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import type { FormEvent, ReactNode } from 'react';
import { SubmitButton } from './SubmitButton.tsx';
import { useIsMobile } from './use-breakpoint.ts';

type Props = {
  title: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** 送信中は保存ボタンを無効にする */
  submitting: boolean;
  /** 送信の失敗など、項目に紐づかないエラー */
  error?: string | null;
  maxWidth?: 'xs' | 'sm';
  /** 項目を下端まで広げる。電卓のように余白をすべて使う項目（flexGrow）があるとき */
  fill?: boolean;
  children: ReactNode;
};

/**
 * 入力フォーム用のダイアログ。<form> を含み、Enter で送信できる。常に開いた状態で描画し、呼び出し側が条件付きでマウントする（閉じたら状態も消える）。
 * 項目は縦に並べ、エラーを先頭に出し、右下にキャンセルと保存を置く。
 * スマホでは全画面にして閉じるボタンを見出しに置き、操作ボタンを下端に固定する（キーボード表示時も届くように）。
 */
export function FormDialog({
  title,
  onClose,
  onSubmit,
  submitting,
  error,
  maxWidth = 'sm',
  fill = false,
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
        <DialogContent sx={fill ? { display: 'flex', flexDirection: 'column' } : undefined}>
          <Stack spacing={2} sx={{ mt: 1, flexGrow: fill ? 1 : undefined }}>
            {error && <Alert severity="error">{error}</Alert>}
            {children}
          </Stack>
        </DialogContent>
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
          <Button onClick={onClose}>キャンセル</Button>
          <SubmitButton disabled={submitting} />
        </DialogActions>
      </form>
    </Dialog>
  );
}
