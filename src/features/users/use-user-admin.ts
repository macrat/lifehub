import {
  createUserSchema,
  type UpdateUserInput,
  updateUserSchema,
} from '../../../shared/validation/users.ts';
import { useOpenWith, useToggle } from '../../lib/ui/use-toggle.ts';
import { type User, useCreateUser, useUpdateUser, useUsers } from './queries.ts';

/**
 * ユーザーの管理画面の状態と操作。登録・編集のフォームを開いているかと、それぞれの保存先を持つ。
 * フォームに渡すもの（`createForm` / `editForm`。`UserForm` の props そのもの）は、閉じていれば null。
 */
export function useUserAdmin() {
  const usersQuery = useUsers();
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
          schema: createUserSchema,
          onClose: creating.off,
          onSubmit: createUser.mutateAsync,
        }
      : null,
    editForm: editingUser
      ? {
          user: editingUser,
          schema: updateUserSchema,
          onClose: editing.close,
          onSubmit: (input: UpdateUserInput) =>
            updateUser.mutateAsync({ id: editingUser.id, ...input }),
        }
      : null,
  };
}
