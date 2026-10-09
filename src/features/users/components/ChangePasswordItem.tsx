import PasswordIcon from '@mui/icons-material/Password';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import {
  type ChangePasswordInput,
  changePasswordSchema,
} from '../../../../shared/validation/users.ts';
import { formValues, useFormSubmit } from '../../../lib/form.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import { useChangePasswordItem } from '../use-change-password-item.ts';
import { PasswordField } from './PasswordField.tsx';

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

/** 今のパスワードと新しいパスワード */
function ChangePasswordForm({ onClose, onSubmit }: Props) {
  const { errors, sheet } = useFormSubmit({
    schema: changePasswordSchema,
    values: formValues,
    onSubmit,
    onSaved: onClose,
  });
  return (
    <RecordSheet {...sheet} onClose={onClose} title="パスワードを変更">
      <PasswordField
        name="currentPassword"
        label="今のパスワード"
        kind="current"
        error={errors.currentPassword}
        autoFocus
      />
      <PasswordField
        name="newPassword"
        label="新しいパスワード"
        kind="new"
        error={errors.newPassword}
      />
    </RecordSheet>
  );
}
