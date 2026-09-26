import Alert from '@mui/material/Alert';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import { SettingsSection } from '../../../lib/ui/SettingsSection.tsx';
import { usePushSetting } from '../use-push-setting.ts';

/** この端末のプッシュ通知の設定（1 つのスイッチと、購読できない理由の案内） */
export function PushSection() {
  const { subscribed, disabled, setSubscribed, notes } = usePushSetting();

  return (
    <SettingsSection title="プッシュ通知">
      <ListItem
        secondaryAction={
          <Switch
            edge="end"
            checked={subscribed}
            disabled={disabled}
            onChange={(_, checked) => setSubscribed(checked)}
            slotProps={{ input: { 'aria-label': 'この端末で通知を受け取る' } }}
          />
        }
      >
        <ListItemText
          // secondaryAction の既定の余白（48px）ではスイッチ（58px）と説明文が重なる
          sx={{ pr: 5 }}
          primary="この端末で通知を受け取る"
          secondary="予定の開始前と、タスクの開始日時・期限日時に通知します。端末ごとに設定します。"
        />
      </ListItem>
      {notes.length > 0 && (
        <ListItem>
          <Stack spacing={1} sx={{ width: '100%' }}>
            {notes.map(({ key, severity, message }) => (
              <Alert key={key} severity={severity}>
                {message}
              </Alert>
            ))}
          </Stack>
        </ListItem>
      )}
    </SettingsSection>
  );
}
