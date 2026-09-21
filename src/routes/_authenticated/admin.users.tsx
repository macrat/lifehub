import AddIcon from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { UserForm } from '../../features/users/components/UserForm.tsx';
import { UserList } from '../../features/users/components/UserList.tsx';
import {
  type User,
  useCreateUser,
  usersQueryOptions,
  useUpdateUser,
} from '../../features/users/queries.ts';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';
import { ListSkeleton, QueryView } from '../../lib/ui/QueryView.tsx';

export const Route = createFileRoute('/_authenticated/admin/users')({
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const usersQuery = useQuery(usersQueryOptions);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  return (
    <>
      <AppBarContent>
        <Button
          color="inherit"
          startIcon={<AddIcon />}
          onClick={() => setCreating(true)}
          sx={{ ml: 'auto' }}
        >
          ユーザーを登録
        </Button>
      </AppBarContent>
      <QueryView query={usersQuery} skeleton={<ListSkeleton rows={3} />}>
        {(users) => <UserList users={users} onEdit={setEditing} />}
      </QueryView>
      {creating && (
        <UserForm
          mode="create"
          onClose={() => setCreating(false)}
          onSubmit={createUser.mutateAsync}
        />
      )}
      {editing && (
        <UserForm
          mode="edit"
          user={editing}
          onClose={() => setEditing(null)}
          onSubmit={(input) => updateUser.mutateAsync({ id: editing.id, ...input })}
        />
      )}
    </>
  );
}
