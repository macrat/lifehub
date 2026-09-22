import EditIcon from '@mui/icons-material/Edit';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import type { User } from '../queries.ts';
import { UserAvatar } from './UserAvatar.tsx';

type Props = {
  users: User[];
  onEdit: (user: User) => void;
};

export function UserList({ users, onEdit }: Props) {
  return (
    <List disablePadding>
      {users.map((user) => (
        <ListItem
          key={user.id}
          divider
          secondaryAction={
            <IconButton edge="end" aria-label={`${user.name} を編集`} onClick={() => onEdit(user)}>
              <EditIcon />
            </IconButton>
          }
        >
          <ListItemAvatar>
            <UserAvatar name={user.name} hue={user.hue} />
          </ListItemAvatar>
          <ListItemText primary={user.name} secondary={user.email} />
        </ListItem>
      ))}
    </List>
  );
}
