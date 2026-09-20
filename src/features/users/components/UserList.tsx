import EditIcon from '@mui/icons-material/Edit';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import useMediaQuery from '@mui/material/useMediaQuery';
import { hueColor } from '../../../../shared/color.ts';
import type { User } from '../queries.ts';

type Props = {
  users: User[];
  onEdit: (user: User) => void;
};

export function UserList({ users, onEdit }: Props) {
  const dark = useMediaQuery('(prefers-color-scheme: dark)');
  return (
    <Paper>
      <List disablePadding>
        {users.map((user) => (
          <ListItem
            key={user.id}
            divider
            secondaryAction={
              <IconButton
                edge="end"
                aria-label={`${user.name} を編集`}
                onClick={() => onEdit(user)}
              >
                <EditIcon />
              </IconButton>
            }
          >
            <ListItemAvatar>
              <Avatar sx={{ bgcolor: hueColor(user.hue, 'fill', dark ? 'dark' : 'light') }}>
                {user.name.slice(0, 1)}
              </Avatar>
            </ListItemAvatar>
            <ListItemText primary={user.name} secondary={user.email} />
          </ListItem>
        ))}
      </List>
    </Paper>
  );
}
