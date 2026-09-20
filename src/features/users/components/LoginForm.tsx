import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { type LoginInput, loginSchema } from '../../../../shared/validation/users.ts';
import { formValues, useFormSubmit } from '../../../lib/form.ts';
import { SubmitButton } from '../../../lib/ui/SubmitButton.tsx';

type Props = {
  onSubmit: (input: LoginInput) => Promise<void>;
};

export function LoginForm({ onSubmit }: Props) {
  const { errors, submitError, submitting, handleSubmit } = useFormSubmit({
    schema: loginSchema,
    values: formValues,
    onSubmit,
    errorMessage: 'ログインに失敗しました',
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
        <SubmitButton size="large" disabled={submitting}>
          ログイン
        </SubmitButton>
      </Stack>
    </form>
  );
}
