import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
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

/** 設定: この端末でプッシュ通知を受け取るかどうか。 */
function SettingsPage() {
  const status = usePushStatus();
  const subscribe = useSubscribePush();
  const unsubscribe = useUnsubscribePush();
  const subscribed = status.data?.subscribed ?? false;
  const denied = status.data?.permission === 'denied';
  const error = subscribe.error ?? unsubscribe.error;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h6" component="h3">
          プッシュ通知
        </Typography>
        <Typography variant="body2" color="text.secondary">
          予定の開始前と、タスクの開始日時・期限日時に通知します。端末ごとに設定します。
        </Typography>
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
        <Typography>
          この端末:{' '}
          {status.isPending && pushSupported
            ? '確認中…'
            : subscribed
              ? '通知を受け取る'
              : '受け取らない'}
        </Typography>
        {subscribed ? (
          <Button
            variant="outlined"
            disabled={unsubscribe.isPending}
            onClick={() => unsubscribe.mutate()}
          >
            この端末の通知を止める
          </Button>
        ) : (
          <Button
            variant="contained"
            disabled={!pushSupported || denied || subscribe.isPending}
            onClick={() => subscribe.mutate()}
          >
            この端末で通知を受け取る
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
