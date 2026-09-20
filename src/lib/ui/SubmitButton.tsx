import Button, { type ButtonProps } from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import { useOnline } from '../online.ts';

const OFFLINE_MESSAGE = 'オフラインのため保存できません';

/** フォームの保存ボタン。オフライン時は無効化し、理由を示す。 */
export function SubmitButton({ disabled, children = '保存', ...props }: ButtonProps) {
  const online = useOnline();
  const button = (
    <Button type="submit" variant="contained" disabled={disabled || !online} {...props}>
      {children}
    </Button>
  );
  if (online) return button;
  return (
    <Tooltip title={OFFLINE_MESSAGE}>
      <span>{button}</span>
    </Tooltip>
  );
}
