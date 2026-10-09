import type { ChangePasswordInput } from '../../../shared/validation/users.ts';
import { useChangePassword } from '../../lib/auth.ts';
import { useToggle } from '../../lib/ui/use-toggle.ts';

/**
 * 設定画面の「パスワードを変更」（`ChangePasswordItem`）の状態と操作。フォームを開いているかと保存先を持つ。
 * フォームに渡すもの（`form`。`ChangePasswordForm` の props そのもの）は、閉じていれば null。
 */
export function useChangePasswordItem() {
  const changePassword = useChangePassword();
  const open = useToggle();
  return {
    start: open.on,
    form: open.value
      ? {
          onClose: open.off,
          onSubmit: (input: ChangePasswordInput) => changePassword.mutateAsync(input),
        }
      : null,
  };
}
