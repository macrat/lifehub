import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { type FormEvent, useState } from 'react';
import { DEFAULT_HUE } from '../../../../shared/color.ts';
import {
  type CreateUserInput,
  createUserSchema,
  type UpdateUserInput,
  updateUserSchema,
} from '../../../../shared/validation/users.ts';
import { type FormErrors, parseForm } from '../../../lib/form.ts';
import { FormDialog } from '../../../lib/ui/FormDialog.tsx';
import { SubmitButton } from '../../../lib/ui/SubmitButton.tsx';
import type { User } from '../queries.ts';
import { HueSlider } from './HueSlider.tsx';

type CreateProps = {
  mode: 'create';
  open: boolean;
  onClose: () => void;
  onSubmit: (input: CreateUserInput) => Promise<unknown>;
};

type EditProps = {
  mode: 'edit';
  open: boolean;
  user: User;
  onClose: () => void;
  onSubmit: (input: UpdateUserInput) => Promise<unknown>;
};

/** ユーザーの登録（create）と、名前・パスワードの変更（edit）を 1 つのダイアログで扱う。 */
export function UserForm(props: CreateProps | EditProps) {
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 色は登録時は省略可（サーバーが既存ユーザーと離れた色相を選ぶ）。編集時は今の色から始める
  const [hue, setHue] = useState<number | null>(props.mode === 'edit' ? props.user.hue : null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (hue !== null) formData.set('hue', String(hue));
    const parsed =
      props.mode === 'create'
        ? parseForm(createUserSchema, formData)
        : parseForm(updateUserSchema, formData);
    if (parsed.errors) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (props.mode === 'create') {
        await props.onSubmit(parsed.data as CreateUserInput);
      } else {
        await props.onSubmit(parsed.data as UpdateUserInput);
      }
      props.onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '保存に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={props.open}
      onClose={props.onClose}
      maxWidth="xs"
      title={props.mode === 'create' ? 'ユーザーを登録' : 'ユーザーを編集'}
      onSubmit={handleSubmit}
      actions={
        <>
          <Button onClick={props.onClose}>キャンセル</Button>
          <SubmitButton disabled={submitting} />
        </>
      }
    >
      <Stack spacing={2} sx={{ mt: 1 }}>
        {submitError && <Alert severity="error">{submitError}</Alert>}
        {errors._ && <Alert severity="error">{errors._}</Alert>}
        <TextField
          name="name"
          label="名前"
          defaultValue={props.mode === 'edit' ? props.user.name : ''}
          error={Boolean(errors.name)}
          helperText={errors.name}
          autoFocus
          fullWidth
        />
        {props.mode === 'create' && (
          <TextField
            name="email"
            label="メールアドレス"
            type="email"
            autoComplete="off"
            error={Boolean(errors.email)}
            helperText={errors.email}
            fullWidth
          />
        )}
        <TextField
          name="password"
          label={props.mode === 'create' ? 'パスワード' : '新しいパスワード（変更する場合）'}
          type="password"
          autoComplete="new-password"
          error={Boolean(errors.password)}
          helperText={errors.password ?? '12文字以上'}
          fullWidth
        />
        <HueSlider value={hue ?? DEFAULT_HUE} onChange={setHue} />
      </Stack>
    </FormDialog>
  );
}
