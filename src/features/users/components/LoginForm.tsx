import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { type LoginInput, loginSchema } from '../../../../shared/validation/users.ts';
import { formValues, useFormSubmit } from '../../../lib/form.ts';
import { SubmitButton } from '../../../lib/ui/SubmitButton.tsx';

type Props = {
  onSubmit: (input: LoginInput) => Promise<void>;
};

/** ログイン。成功すれば画面が移るので、閉じる・開き直すはなく、失敗をその場に出すだけ。 */
export function LoginForm({ onSubmit }: Props) {
  const { errors, submitError, submitted, handleSubmit } = useFormSubmit({
    schema: loginSchema,
    values: formValues,
    onSubmit,
  });

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Stack spacing={2}>
        {submitError && <Alert severity="error">{submitError}</Alert>}
        <TextField
          name="email"
          label="メールアドレス"
          type="email"
          autoComplete="username"
          error={Boolean(errors.email)}
          helperText={errors.email}
          autoFocus
          fullWidth
        />
        <TextField
          name="password"
          label="パスワード"
          type="password"
          autoComplete="current-password"
          error={Boolean(errors.password)}
          helperText={errors.password}
          fullWidth
        />
        <SubmitButton size="large" disabled={submitted}>
          ログイン
        </SubmitButton>
      </Stack>
    </form>
  );
}
