import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { type FormEvent, useState } from 'react';
import { type LoginInput, loginSchema } from '../../../../shared/validation/users.ts';
import { type FormErrors, parseForm } from '../../../lib/form.ts';

type Props = {
  onSubmit: (input: LoginInput) => Promise<void>;
};

export function LoginForm({ onSubmit }: Props) {
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseForm(loginSchema, new FormData(event.currentTarget));
    if (parsed.errors) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setSubmitError(null);
    setSubmitting(true);
    try {
      await onSubmit(parsed.data);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'ログインに失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

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
        <Button type="submit" variant="contained" size="large" disabled={submitting}>
          ログイン
        </Button>
      </Stack>
    </form>
  );
}
