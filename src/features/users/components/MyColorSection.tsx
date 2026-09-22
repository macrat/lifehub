import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Stack from '@mui/material/Stack';
import { useMyColor } from '../use-my-color.ts';
import { HueSlider } from './HueSlider.tsx';
import { UserAvatar } from './UserAvatar.tsx';

/** 設定画面の「色」。選ぶとその場でアクセントカラーになり、保存ボタンで保存する（`use-my-color.ts`） */
export function MyColorSection() {
  const { name, hue, changed, pick, save } = useMyColor();
  return (
    <List
      subheader={
        <ListSubheader component="h3" disableSticky>
          色
        </ListSubheader>
      }
    >
      <ListItem>
        <ListItemAvatar>
          <UserAvatar name={name} hue={hue} />
        </ListItemAvatar>
        <ListItemText
          primary={name}
          secondary="ボタンや選択の色と、カレンダーでこのユーザーの予定・タスクに付く色"
        />
      </ListItem>
      <Stack spacing={1} sx={{ px: 2, pb: 1 }}>
        <HueSlider value={hue} onChange={pick} />
        <Button
          variant="contained"
          disabled={!changed}
          onClick={save}
          sx={{ alignSelf: 'flex-end' }}
        >
          保存
        </Button>
      </Stack>
    </List>
  );
}
