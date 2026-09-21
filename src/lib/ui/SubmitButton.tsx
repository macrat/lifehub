import Button, { type ButtonProps } from '@mui/material/Button';

/** フォームの保存ボタン。オフラインでも押せる（書き込みは端末に溜めて後から送る）。 */
export function SubmitButton({ children = '保存', ...props }: ButtonProps) {
  return (
    <Button type="submit" variant="contained" {...props}>
      {children}
    </Button>
  );
}
