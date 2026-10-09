import {
  registerUserSchema,
  type UpdateUserInput,
  updateUserSchema,
} from '../../../shared/validation/users.ts';
import { meQueryOptions } from '../../lib/auth.ts';
import { useStoreQuery } from '../../lib/screen-data.ts';
import { useOpenWith, useToggle } from '../../lib/ui/use-toggle.ts';
import { type User, useCreateUser, useUpdateUser, useUsers } from './queries.ts';

/**
 * ユーザーの管理画面の状態と操作。登録・編集のフォームを開いているかと、それぞれの保存先を持つ。
 * フォームに渡すもの（`createForm` / `editForm`。`UserForm` の props そのもの）は、閉じていれば null。
 */
export function useUserAdmin() {
  const usersQuery = useUsers();
  const { data: meId } = useStoreQuery({ ...meQueryOptions, select: (me) => me?.id });
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const creating = useToggle();
  const editing = useOpenWith<User>();
  const editingUser = editing.value;

  return {
    usersQuery,
    startCreate: creating.on,
    startEdit: editing.open,
    createForm: creating.value
      ? {
          user: null,
          passwordFields: true,
          schema: registerUserSchema,
          onClose: creating.off,
          onSubmit: createUser.mutateAsync,
        }
      : null,
    editForm: editingUser
      ? {
          user: editingUser,
          // パスワードは本人だけが変えられるので、他人の編集では欄を出さない
          passwordFields: editingUser.id === meId,
          schema: updateUserSchema,
          onClose: editing.close,
          onSubmit: (input: UpdateUserInput) =>
            updateUser.mutateAsync({ id: editingUser.id, ...input }),
        }
      : null,
  };
}
