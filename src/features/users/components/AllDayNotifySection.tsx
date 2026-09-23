import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { SettingsSection } from '../../../lib/ui/SettingsSection.tsx';
import { SubmitButton } from '../../../lib/ui/SubmitButton.tsx';
import { useAllDayNotifyTime } from '../use-all-day-notify-time.ts';

/**
 * 設定画面の「終日の通知」。終日の予定・タスクの通知は、その日（または前日）のこの時刻に届く。
 * ユーザーごとの設定なので、どの端末で受け取っても同じ時刻になる。
 */
export function AllDayNotifySection() {
  const { value, changed, pick, save } = useAllDayNotifyTime();
  return (
    <SettingsSection title="終日の通知">
      <ListItem>
        <ListItemText
          primary="通知する時刻"
          secondary="終日の予定・タスクの通知は、その日（または前日）のこの時刻に届きます"
        />
      </ListItem>
      <ListItem>
        <Stack
          component="form"
          direction="row"
          spacing={2}
          sx={{ width: '100%', alignItems: 'center' }}
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <TextField
            label="時刻"
            type="time"
            value={value}
            onChange={(event) => pick(event.target as HTMLInputElement)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ flex: 1 }}
          />
          <SubmitButton disabled={!changed} />
        </Stack>
      </ListItem>
    </SettingsSection>
  );
}
