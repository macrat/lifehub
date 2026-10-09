import TextField from '@mui/material/TextField';
import { PASSWORD_MIN_LENGTH } from '../../../../shared/constants.ts';

type Props = {
  name: string;
  label: string;
  /** new: 新しく決めるパスワード（長さの決まりを出す）。current: 本人の確認の今のパスワード */
  kind: 'new' | 'current';
  error: string | undefined;
  autoFocus?: boolean;
};

/** パスワードの欄。ブラウザのパスワード管理が新旧を見分けられるよう、種類で autocomplete を決める */
export function PasswordField({ name, label, kind, error, autoFocus }: Props) {
  return (
    <TextField
      name={name}
      label={label}
      type="password"
      autoComplete={kind === 'new' ? 'new-password' : 'current-password'}
      error={Boolean(error)}
      helperText={error ?? (kind === 'new' ? `${PASSWORD_MIN_LENGTH}文字以上` : undefined)}
      autoFocus={autoFocus}
      fullWidth
    />
  );
}
