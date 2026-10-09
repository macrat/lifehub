import PasswordIcon from '@mui/icons-material/Password';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import { PASSWORD_MIN_LENGTH } from '../../../../shared/constants.ts';
import {
  type ChangePasswordInput,
  changePasswordSchema,
} from '../../../../shared/validation/users.ts';
import { formValues, useFormSubmit } from '../../../lib/form.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import { useChangePasswordItem } from '../use-change-password-item.ts';

/** 設定画面の「アカウント」の、自分のパスワードの変更の行。押すと変更のシートを開く */
export function ChangePasswordItem() {
  const { start, form } = useChangePasswordItem();
  return (
    <>
      <ListItem disablePadding>
        <ListItemButton onClick={start}>
          <ListItemIcon>
            <PasswordIcon />
          </ListItemIcon>
          <ListItemText
            primary="パスワードを変更"
            secondary="変えるとすべての端末でログインし直しになります"
          />
        </ListItemButton>
      </ListItem>
      {form && <ChangePasswordForm {...form} />}
    </>
  );
}

type Props = {
  onClose: () => void;
  onSubmit: (input: ChangePasswordInput) => Promise<unknown>;
};

/** 今のパスワード（本人の確認。`server/lib/trpc.ts` の `reauthedProcedure`）と新しいパスワード */
function ChangePasswordForm({ onClose, onSubmit }: Props) {
  const { errors, sheet } = useFormSubmit({
    schema: changePasswordSchema,
    values: formValues,
    onSubmit,
    onSaved: onClose,
  });
  return (
    <RecordSheet {...sheet} onClose={onClose} title="パスワードを変更">
      <TextField
        name="currentPassword"
        label="今のパスワード"
        type="password"
        autoComplete="current-password"
        error={Boolean(errors.currentPassword)}
        helperText={errors.currentPassword}
        autoFocus
        fullWidth
      />
      <TextField
        name="newPassword"
        label="新しいパスワード"
        type="password"
        autoComplete="new-password"
        error={Boolean(errors.newPassword)}
        helperText={errors.newPassword ?? `${PASSWORD_MIN_LENGTH}文字以上`}
        fullWidth
      />
    </RecordSheet>
  );
}
