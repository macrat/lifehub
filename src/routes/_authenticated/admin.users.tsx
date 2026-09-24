import AddIcon from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { UserForm } from '../../features/users/components/UserForm.tsx';
import { UserList } from '../../features/users/components/UserList.tsx';
import {
  type User,
  useCreateUser,
  usersQueryOptions,
  useUpdateUser,
} from '../../features/users/queries.ts';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';
import { NoPullToRefresh } from '../../lib/ui/NoPullToRefresh.tsx';
import { ListSkeleton, QueryView } from '../../lib/ui/QueryView.tsx';
import { useOpenWith, useToggle } from '../../lib/ui/use-toggle.ts';

export const Route = createFileRoute('/_authenticated/admin/users')({
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const usersQuery = useQuery(usersQueryOptions);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const creating = useToggle();
  const editing = useOpenWith<User>();
  const editingUser = editing.value;

  return (
    <>
      <NoPullToRefresh />
      <AppBarContent>
        <Button color="inherit" startIcon={<AddIcon />} onClick={creating.on} sx={{ ml: 'auto' }}>
          ユーザーを登録
        </Button>
      </AppBarContent>
      <QueryView query={usersQuery} skeleton={<ListSkeleton rows={3} />}>
        {(users) => <UserList users={users} onEdit={editing.open} />}
      </QueryView>
      {creating.value && (
        <UserForm mode="create" onClose={creating.off} onSubmit={createUser.mutateAsync} />
      )}
      {editingUser && (
        <UserForm
          mode="edit"
          user={editingUser}
          onClose={editing.close}
          onSubmit={(input) => updateUser.mutateAsync({ id: editingUser.id, ...input })}
        />
      )}
    </>
  );
}
