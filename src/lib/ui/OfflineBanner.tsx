import Alert from '@mui/material/Alert';
import { useMutationState } from '@tanstack/react-query';
import { useOnline } from '../online.ts';

/**
 * オフライン中の案内。閲覧はキャッシュから続けられ、記録もそのまま行える
 * （送れない書き込みは端末に溜まり、オンラインに戻ったときに送られる。`lib/query-client.ts`）。
 */
export function OfflineBanner() {
  const online = useOnline();
  const queued = useMutationState({ filters: { predicate: (m) => m.state.isPaused } }).length;
  if (online) return null;
  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      オフラインです。表示中の内容は最後に取得したものです。記録はこの端末に保存し、オンラインに戻ったときに送ります
      {queued > 0 && `（未送信 ${queued} 件）`}。
    </Alert>
  );
}
