import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import type { z } from 'zod';
import { DEFAULT_HUE } from '../../../../shared/color.ts';
import { PASSWORD_MIN_LENGTH } from '../../../../shared/constants.ts';
import { formValues, useFormSubmit } from '../../../lib/form.ts';
import { CopyField } from '../../../lib/ui/CopyField.tsx';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import type { User } from '../queries.ts';
import { HueSlider } from './HueSlider.tsx';

/**
 * 登録と編集のどちらか。検証のスキーマと保存先を組にして持つので（`useUserAdmin`）、
 * フォームは受け取ったスキーマの出力をそのまま保存先へ渡せる（登録か編集かで型を読み分けない）。
 */
type Props<S extends z.ZodType> = {
  /** 編集するユーザー。登録なら null */
  user: User | null;
  schema: S;
  onClose: () => void;
  onSubmit: (input: z.output<S>) => Promise<unknown>;
};

/** ユーザーの登録（user が null）と、名前・パスワード・色の変更を 1 つのシートで扱う。 */
export function UserForm<S extends z.ZodType>({ user, schema, onClose, onSubmit }: Props<S>) {
  // 色は登録時は省略可（サーバーが既存ユーザーと離れた色相を選ぶ）。編集時は今の色から始める
  const [hue, setHue] = useState<number | null>(user?.hue ?? null);

  const { errors, sheet } = useFormSubmit({
    schema,
    values: (fd) => ({ ...formValues(fd), hue: hue ?? undefined }),
    onSubmit,
    onSaved: onClose,
  });

  return (
    <RecordSheet {...sheet} onClose={onClose} title={user ? 'ユーザーを編集' : 'ユーザーを登録'}>
      {errors._ && <Alert severity="error">{errors._}</Alert>}
      <TextField
        name="name"
        label="名前"
        defaultValue={user?.name ?? ''}
        error={Boolean(errors.name)}
        helperText={errors.name}
        autoFocus
        fullWidth
      />
      {!user && (
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
        label={user ? '新しいパスワード（変更する場合）' : 'パスワード'}
        type="password"
        autoComplete="new-password"
        error={Boolean(errors.password)}
        helperText={errors.password ?? `${PASSWORD_MIN_LENGTH}文字以上`}
        fullWidth
      />
      <HueSlider value={hue ?? DEFAULT_HUE} onChange={setHue} />
      {/* Sentry の記録（`server/lib/sentry.ts` の `setSentryUser`）や DB と見比べるために出す */}
      {user && (
        <CopyField label="ユーザー ID" value={user.id} copied="ユーザー ID をコピーしました" />
      )}
    </RecordSheet>
  );
}
