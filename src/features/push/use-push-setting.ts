import type { AlertColor } from '@mui/material/Alert';
import { isIOS } from '../../lib/platform.ts';
import {
  isStandalone,
  pushSupported,
  usePushStatus,
  useSubscribePush,
  useUnsubscribePush,
} from './queries.ts';

/** 購読できない理由と失敗の知らせ 1 つ */
type PushNote = { key: string; severity: AlertColor; message: string };

/**
 * この端末のプッシュ通知の設定（`PushSection`）の状態と操作。スイッチの値と押せるか、
 * 購読できない理由と失敗の知らせ（並べるものを値で持ち、何も無ければ空）を導く。
 */
export function usePushSetting() {
  const status = usePushStatus();
  const subscribe = useSubscribePush();
  const unsubscribe = useUnsubscribePush();
  const denied = status.data?.permission === 'denied';
  const busy = subscribe.isPending || unsubscribe.isPending || (status.isPending && pushSupported);
  const error = subscribe.error ?? unsubscribe.error;

  const notes: PushNote[] = [];
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

  return {
    subscribed: status.data?.subscribed ?? false,
    /** スイッチを押せないか（未対応・ブロック中・切り替え中） */
    disabled: !pushSupported || denied || busy,
    setSubscribed: (checked: boolean) => (checked ? subscribe.mutate() : unsubscribe.mutate()),
    notes,
  };
}
