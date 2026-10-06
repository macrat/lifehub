import { createFileRoute } from '@tanstack/react-router';
import { UserForm } from '../../features/users/components/UserForm.tsx';
import { UserList } from '../../features/users/components/UserList.tsx';
import { useUserAdmin } from '../../features/users/use-user-admin.ts';
import { AddFab } from '../../lib/ui/AddFab.tsx';
import { ListSkeleton, QueryView } from '../../lib/ui/QueryView.tsx';
import { SubPageBar } from '../../lib/ui/SubPageBar.tsx';

export const Route = createFileRoute('/_authenticated/admin/users')({
  // 引いて取り直したい内容を持たず、入力のシートを開いて使う画面なので、引っ張って更新はしない
  staticData: { noPullToRefresh: true },
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const admin = useUserAdmin();

  return (
    <>
      <SubPageBar title="ユーザー管理" fallback="/settings" />
      <QueryView query={admin.usersQuery} skeleton={<ListSkeleton rows={3} />}>
        {(users) => <UserList users={users} onEdit={admin.startEdit} />}
      </QueryView>
      <AddFab label="ユーザーを登録" onClick={admin.startCreate} />
      {admin.createForm && <UserForm {...admin.createForm} />}
      {admin.editForm && <UserForm {...admin.editForm} />}
    </>
  );
}
