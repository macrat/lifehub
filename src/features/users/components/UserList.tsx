import EditIcon from '@mui/icons-material/Edit';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import type { User } from '../queries.ts';

type Props = {
  users: User[];
  onEdit: (user: User) => void;
};

export function UserList({ users, onEdit }: Props) {
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
            <ListItemText primary={user.name} secondary={user.email} />
          </ListItem>
        ))}
      </List>
    </Paper>
  );
}
