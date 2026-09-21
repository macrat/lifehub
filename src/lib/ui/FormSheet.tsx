import CloseIcon from '@mui/icons-material/Close';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ComponentProps } from 'react';
import { BottomSheet } from './BottomSheet.tsx';
import { useDialogHistory } from './dialog-history.ts';
import { FormDialog } from './FormDialog.tsx';
import { SubmitButton } from './SubmitButton.tsx';
import { useIsMobile } from './use-breakpoint.ts';

type Props = ComponentProps<typeof FormDialog>;

/**
 * 高さをあまり必要としない入力フォーム。PC では `FormDialog` と同じ中央のダイアログ、
 * スマホではカレンダーのクイック入力と同じ、下へスワイプして閉じられるシート（`BottomSheet`）。
 *
 * シートは中身の高さのまま画面の下に出るので、項目が少ないフォームほど入力欄も操作も
 * 指の届く下半分に集まり、後ろの画面も見えたままになる。
 * 全画面にするほど項目が多いフォーム（予定・タスク）は `FormDialog` のままにする。
 */
export function FormSheet(props: Props) {
  const isMobile = useIsMobile();
  // 履歴の項目はそれぞれが自分で持つ（`useDialogHistory`）ので、常にどちらか一方だけをマウントする
  return isMobile ? <Sheet {...props} /> : <FormDialog {...props} />;
}

/**
 * スマホ: 見出しと操作は動かさず、項目だけがはみ出したらスクロールする。
 * 操作の置き方はクイック入力のシートに揃える（閉じるは左上のバツ、保存は右上）。
 */
function Sheet({ title, open, onClose, onSubmit, error, children }: Props) {
  // 全画面のフォームと同じく、戻る操作では前の画面へ行かずフォームだけを閉じる
  useDialogHistory(onClose);
  return (
    <BottomSheet open={open} onClose={onClose} label={title}>
      <Stack component="form" onSubmit={onSubmit} noValidate sx={{ minHeight: 0 }}>
        <Stack spacing={1} sx={{ pb: 1 }}>
          <Stack direction="row" spacing={1} sx={{ px: 1, alignItems: 'center' }}>
            <IconButton aria-label="閉じる" onClick={onClose}>
              <CloseIcon />
            </IconButton>
            <Typography variant="h6" component="h2" sx={{ flexGrow: 1, minWidth: 0 }}>
              {title}
            </Typography>
            <SubmitButton />
          </Stack>
          {error && (
            <Alert severity="error" sx={{ mx: 2 }}>
              {error}
            </Alert>
          )}
        </Stack>
        <Stack
          data-sheet-scroll
          spacing={2}
          sx={{
            flexGrow: 1,
            minHeight: 0,
            overflowY: 'auto',
            touchAction: 'pan-y',
            px: 2,
            // 縮んだラベルは入力欄の上端にはみ出すので、その分の余白を空ける
            pt: 1,
            pb: 'calc(16px + env(safe-area-inset-bottom))',
          }}
        >
          {children}
        </Stack>
      </Stack>
    </BottomSheet>
  );
}
