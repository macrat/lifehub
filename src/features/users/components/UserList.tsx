import { EditableList, EditableListItem } from '../../../lib/ui/EditableList.tsx';
import type { User } from '../queries.ts';
import { UserAvatar } from './UserAvatar.tsx';

type Props = {
  users: User[];
  onEdit: (user: User) => void;
};

/** ユーザー管理の一覧。左にアバター、名前とメール、右端の鉛筆で編集を開く（形は `EditableList`） */
export function UserList({ users, onEdit }: Props) {
  return (
    <EditableList>
      {users.map((user) => (
        <EditableListItem
          key={user.id}
          icon={<UserAvatar name={user.name} hue={user.hue} />}
          primary={user.name}
          secondary={user.email}
          editLabel={`${user.name} を編集`}
          onEdit={() => onEdit(user)}
        />
      ))}
    </EditableList>
  );
}
