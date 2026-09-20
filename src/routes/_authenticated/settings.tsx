import Alert from '@mui/material/Alert';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import { createFileRoute } from '@tanstack/react-router';
import {
  isStandalone,
  pushSupported,
  usePushStatus,
  useSubscribePush,
  useUnsubscribePush,
} from '../../lib/push.ts';

export const Route = createFileRoute('/_authenticated/settings')({
  component: SettingsPage,
});

const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

/** 設定: この端末でプッシュ通知を受け取るかどうか。Google 系アプリの設定画面と同じ「見出し + スイッチ行」。 */
function SettingsPage() {
  const status = usePushStatus();
  const subscribe = useSubscribePush();
  const unsubscribe = useUnsubscribePush();
  const subscribed = status.data?.subscribed ?? false;
  const denied = status.data?.permission === 'denied';
  const busy = subscribe.isPending || unsubscribe.isPending || (status.isPending && pushSupported);
  const error = subscribe.error ?? unsubscribe.error;

  return (
    <List
      subheader={
        <ListSubheader component="h3" disableSticky>
          プッシュ通知
        </ListSubheader>
      }
    >
      <ListItem
        secondaryAction={
          <Switch
            edge="end"
            checked={subscribed}
            disabled={!pushSupported || denied || busy}
            onChange={(_, checked) => (checked ? subscribe.mutate() : unsubscribe.mutate())}
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
      <Stack spacing={1} sx={{ px: 2, pt: 1 }}>
        {!pushSupported && (
          <Alert severity="warning">このブラウザはプッシュ通知に対応していません。</Alert>
        )}
        {pushSupported && isIOS && !isStandalone() && (
          <Alert severity="info">
            iPhone / iPad
            では、共有メニューから「ホーム画面に追加」したアプリでのみ通知を受け取れます。
          </Alert>
        )}
        {denied && (
          <Alert severity="warning">
            通知がブロックされています。ブラウザの設定で許可してください。
          </Alert>
        )}
        {error && <Alert severity="error">{error.message}</Alert>}
      </Stack>
    </List>
  );
}
