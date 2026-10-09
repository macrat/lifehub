import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import type { z } from 'zod';
import { CopyField } from '../../../lib/ui/CopyField.tsx';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import type { User } from '../queries.ts';
import { useUserForm } from '../use-user-form.ts';
import { HueSlider } from './HueSlider.tsx';
import { PasswordField } from './PasswordField.tsx';

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

/** ユーザーの登録（user が null）と、名前・色の変更を 1 つのシートで扱う。パスワードの変更は設定画面（`ChangePasswordItem`） */
export function UserForm<S extends z.ZodType>({ user, ...options }: Props<S>) {
  const { errors, sheet, hue } = useUserForm({ user, ...options });

  return (
    <RecordSheet {...sheet} title={user ? 'ユーザーを編集' : 'ユーザーを登録'}>
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
        <>
          <TextField
            name="email"
            label="メールアドレス"
            type="email"
            autoComplete="off"
            error={Boolean(errors.email)}
            helperText={errors.email}
            fullWidth
          />
          <PasswordField name="password" label="パスワード" kind="new" error={errors.password} />
          <PasswordField
            name="currentPassword"
            label="あなたの今のパスワード"
            kind="current"
            error={errors.currentPassword}
          />
        </>
      )}
      <HueSlider {...hue} />
      {/* Sentry の記録（`server/lib/sentry.ts` の `setSentryUser`）や DB と見比べるために出す */}
      {user && (
        <CopyField label="ユーザー ID" value={user.id} copied="ユーザー ID をコピーしました" />
      )}
    </RecordSheet>
  );
}
