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
import { ensureData } from '../../lib/query-client.ts';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';

export const Route = createFileRoute('/_authenticated/admin/users')({
  loader: ({ context }) => ensureData(context.queryClient, usersQueryOptions),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const { data: users = [] } = useQuery(usersQueryOptions);
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
      <UserList users={users} onEdit={setEditing} />
      {creating && (
        <UserForm
          mode="create"
          onClose={() => setCreating(false)}
          onSubmit={(input) => createUser.mutateAsync(input)}
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
