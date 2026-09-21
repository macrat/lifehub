import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Fade from '@mui/material/Fade';
import IconButton from '@mui/material/IconButton';
import Slide from '@mui/material/Slide';
import Stack from '@mui/material/Stack';
import type { ComponentProps, FormEvent, ReactNode } from 'react';
import { SubmitButton } from './SubmitButton.tsx';
import { useIsMobile } from './use-breakpoint.ts';

type Props = {
  title: string;
  /** 送信中は閉じた見た目にする（入力は残したまま）。保存できたら呼び出し側がマウントをやめる */
  open: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** 保存の失敗など、項目に紐づかないエラー */
  error?: string | null;
  maxWidth?: 'xs' | 'sm';
  children: ReactNode;
};

/** スマホの全画面表示は、次のページを開いたように右から差し込む（PC は既定の Fade） */
function SlideFromRight(props: ComponentProps<typeof Slide>) {
  return <Slide direction="left" {...props} />;
}

/**
 * 入力フォーム用のダイアログ。<form> を含み、Enter で送信できる。呼び出し側が条件付きでマウントする（マウントをやめれば入力も消える）。
 * 送信中は閉じた見た目になるだけで中身は保つ（keepMounted）ので、保存に失敗したら入力したまま開き直せる。
 * 項目は縦に並べ、エラーを先頭に出し、右下にキャンセルと保存を置く。
 * スマホでは画面いっぱいに右から出し、見出しを AppBar と同じ帯（戻る矢印つき）にして、ページが切り替わったように見せる。
 * 操作ボタンは下端に固定する（キーボード表示時も届くように）。
 */
export function FormDialog({
  title,
  open,
  onClose,
  onSubmit,
  error,
  maxWidth = 'sm',
  children,
}: Props) {
  const isMobile = useIsMobile();
  return (
    <Dialog
      open={open}
      keepMounted
      onClose={onClose}
      fullScreen={isMobile}
      fullWidth
      maxWidth={maxWidth}
      slots={{ transition: isMobile ? SlideFromRight : Fade }}
    >
      <form onSubmit={onSubmit} noValidate style={{ display: 'contents' }}>
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            ...(isMobile && {
              // AppBar（dense）と同じ帯に見せる
              px: 1,
              py: 1,
              pt: 'calc(8px + env(safe-area-inset-top))',
              fontSize: '1.125rem',
              borderBottom: 1,
              borderColor: 'divider',
            }),
          }}
        >
          {isMobile && (
            <IconButton aria-label="戻る" onClick={onClose} edge="start">
              <ArrowBackIcon />
            </IconButton>
          )}
          {title}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
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
          <SubmitButton />
        </DialogActions>
      </form>
    </Dialog>
  );
}
