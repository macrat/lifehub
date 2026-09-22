import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import { SettingsSection } from '../../../lib/ui/SettingsSection.tsx';
import { SubmitButton } from '../../../lib/ui/SubmitButton.tsx';
import { useMyColor } from '../use-my-color.ts';
import { HueSlider } from './HueSlider.tsx';
import { UserAvatar } from './UserAvatar.tsx';

/** 設定画面の「色」。選ぶとその場でアクセントカラーになり、保存ボタンで保存する（`use-my-color.ts`） */
export function MyColorSection() {
  const { name, hue, changed, pick, save } = useMyColor();
  return (
    <SettingsSection title="色">
      <ListItem>
        <ListItemAvatar>
          <UserAvatar name={name} hue={hue} />
        </ListItemAvatar>
        <ListItemText
          primary={name}
          secondary="ボタンや選択の色と、カレンダーでこのユーザーの予定・タスクに付く色"
        />
      </ListItem>
      <ListItem>
        <Stack
          component="form"
          spacing={1}
          sx={{ width: '100%' }}
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <HueSlider value={hue} onChange={pick} />
          <SubmitButton disabled={!changed} sx={{ alignSelf: 'flex-end' }} />
        </Stack>
      </ListItem>
    </SettingsSection>
  );
}
