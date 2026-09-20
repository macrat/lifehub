import EditIcon from '@mui/icons-material/Edit';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import type { User } from '../queries.ts';
import { useUserColor } from '../use-user-color.ts';

type Props = {
  users: User[];
  onEdit: (user: User) => void;
};

export function UserList({ users, onEdit }: Props) {
  const colorFor = useUserColor();
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
            <Avatar sx={{ bgcolor: colorFor(user.id).fill }}>{user.name.slice(0, 1)}</Avatar>
          </ListItemAvatar>
          <ListItemText primary={user.name} secondary={user.email} />
        </ListItem>
      ))}
    </List>
  );
}
