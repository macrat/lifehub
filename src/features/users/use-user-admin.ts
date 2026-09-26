import type { UpdateUserInput } from '../../../shared/validation/users.ts';
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
      ? { mode: 'create' as const, onClose: creating.off, onSubmit: createUser.mutateAsync }
      : null,
    editForm: editingUser
      ? {
          mode: 'edit' as const,
          user: editingUser,
          onClose: editing.close,
          onSubmit: (input: UpdateUserInput) =>
            updateUser.mutateAsync({ id: editingUser.id, ...input }),
        }
      : null,
  };
}
