import AddIcon from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import { createFileRoute } from '@tanstack/react-router';
import { UserForm } from '../../features/users/components/UserForm.tsx';
import { UserList } from '../../features/users/components/UserList.tsx';
import { useUserAdmin } from '../../features/users/use-user-admin.ts';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';
import { ListSkeleton, QueryView } from '../../lib/ui/QueryView.tsx';

export const Route = createFileRoute('/_authenticated/admin/users')({
  // 引いて取り直したい内容を持たず、入力のシートを開いて使う画面なので、引っ張って更新はしない
  staticData: { noPullToRefresh: true },
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const admin = useUserAdmin();

  return (
    <>
      <AppBarContent>
        <Button
          color="inherit"
          startIcon={<AddIcon />}
          onClick={admin.startCreate}
          sx={{ ml: 'auto' }}
        >
          ユーザーを登録
        </Button>
      </AppBarContent>
      <QueryView query={admin.usersQuery} skeleton={<ListSkeleton rows={3} />}>
        {(users) => <UserList users={users} onEdit={admin.startEdit} />}
      </QueryView>
      {admin.createForm && <UserForm {...admin.createForm} />}
      {admin.editForm && <UserForm {...admin.editForm} />}
    </>
  );
}
