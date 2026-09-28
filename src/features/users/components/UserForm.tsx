import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Alert from '@mui/material/Alert';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { DEFAULT_HUE } from '../../../../shared/color.ts';
import { PASSWORD_MIN_LENGTH } from '../../../../shared/constants.ts';
import {
  type CreateUserInput,
  createUserSchema,
  type UpdateUserInput,
  updateUserSchema,
} from '../../../../shared/validation/users.ts';
import { formValues, useFormSubmit } from '../../../lib/form.ts';
import { copyToClipboard } from '../../../lib/ui/clipboard.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import type { User } from '../queries.ts';
import { HueSlider } from './HueSlider.tsx';

type CreateProps = {
  mode: 'create';
  onClose: () => void;
  onSubmit: (input: CreateUserInput) => Promise<unknown>;
};

type EditProps = {
  mode: 'edit';
  user: User;
  onClose: () => void;
  onSubmit: (input: UpdateUserInput) => Promise<unknown>;
};

/** ユーザーの登録（create）と、名前・パスワードの変更（edit）を 1 つのシートで扱う。 */
export function UserForm(props: CreateProps | EditProps) {
  // 色は登録時は省略可（サーバーが既存ユーザーと離れた色相を選ぶ）。編集時は今の色から始める
  const [hue, setHue] = useState<number | null>(props.mode === 'edit' ? props.user.hue : null);

  const { errors, sheet } = useFormSubmit({
    schema: props.mode === 'create' ? createUserSchema : updateUserSchema,
    values: (fd) => ({ ...formValues(fd), hue: hue ?? undefined }),
    onSubmit: (data) =>
      props.mode === 'create'
        ? props.onSubmit(data as CreateUserInput)
        : props.onSubmit(data as UpdateUserInput),
    onSaved: props.onClose,
  });

  return (
    <RecordSheet
      {...sheet}
      onClose={props.onClose}
      title={props.mode === 'create' ? 'ユーザーを登録' : 'ユーザーを編集'}
    >
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
        helperText={errors.password ?? `${PASSWORD_MIN_LENGTH}文字以上`}
        fullWidth
      />
      <HueSlider value={hue ?? DEFAULT_HUE} onChange={setHue} />
      {props.mode === 'edit' && <UserIdField id={props.user.id} />}
    </RecordSheet>
  );
}

/**
 * ユーザー ID（編集できない）。Sentry の記録（`server/lib/sentry.ts` の `setSentryUser`）や DB と
 * 見比べるために出す。押すとコピーする。
 * `name` を付けないので、フォームの値（`formValues`）には入らない。
 */
function UserIdField({ id }: { id: string }) {
  return (
    <TextField
      label="ユーザー ID"
      value={id}
      onClick={() => copyToClipboard(id, 'ユーザー ID をコピーしました')}
      fullWidth
      slotProps={{
        input: {
          readOnly: true,
          sx: { fontFamily: 'monospace', cursor: 'pointer', '& input': { cursor: 'pointer' } },
          endAdornment: (
            <InputAdornment position="end">
              <ContentCopyIcon />
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
