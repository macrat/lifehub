import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { type LoginInput, loginSchema } from '../../../../shared/validation/users.ts';
import { formValues, useFormSubmit } from '../../../lib/form.ts';
import { SubmitButton } from '../../../lib/ui/SubmitButton.tsx';

type Props = {
  onSubmit: (input: LoginInput) => Promise<void>;
};

/**
 * ログイン。ここだけは送信の完了を待ち、失敗をその場に出す（やり直しに入力が要るうえ、
 * アプリの通知（AppShell）はログイン前には無い）。
 */
export function LoginForm({ onSubmit }: Props) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { errors, handleSubmit } = useFormSubmit({
    schema: loginSchema,
    values: formValues,
    onSubmit: async (input) => {
      setSubmitError(null);
      setSubmitting(true);
      try {
        await onSubmit(input);
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : 'ログインに失敗しました');
      } finally {
        setSubmitting(false);
      }
    },
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
