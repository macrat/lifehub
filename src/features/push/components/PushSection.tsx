import Alert, { type AlertColor } from '@mui/material/Alert';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import { SettingsSection } from '../../../lib/ui/SettingsSection.tsx';
import {
  isStandalone,
  pushSupported,
  usePushStatus,
  useSubscribePush,
  useUnsubscribePush,
} from '../queries.ts';

const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

/** この端末のプッシュ通知の設定（1 つのスイッチと、購読できない理由の案内） */
export function PushSection() {
  const status = usePushStatus();
  const subscribe = useSubscribePush();
  const unsubscribe = useUnsubscribePush();
  const subscribed = status.data?.subscribed ?? false;
  const denied = status.data?.permission === 'denied';
  const busy = subscribe.isPending || unsubscribe.isPending || (status.isPending && pushSupported);
  const error = subscribe.error ?? unsubscribe.error;

  /** 購読できない理由と失敗の知らせ。並べるものを値で持ち、何も無ければ行ごと出さない */
  const notes: { key: string; severity: AlertColor; message: string }[] = [];
  if (!pushSupported) {
    notes.push({
      key: 'unsupported',
      severity: 'warning',
      message: 'このブラウザはプッシュ通知に対応していません。',
    });
  }
  if (pushSupported && isIOS && !isStandalone()) {
    notes.push({
      key: 'ios',
      severity: 'info',
      message:
        'iPhone / iPad では、共有メニューから「ホーム画面に追加」したアプリでのみ通知を受け取れます。',
    });
  }
  if (denied) {
    notes.push({
      key: 'denied',
      severity: 'warning',
      message: '通知がブロックされています。ブラウザの設定で許可してください。',
    });
  }
  if (error) {
    notes.push({ key: 'error', severity: 'error', message: error.message });
  }

  return (
    <SettingsSection title="プッシュ通知">
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
