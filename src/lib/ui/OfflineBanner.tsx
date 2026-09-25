import Alert from '@mui/material/Alert';
import { useMutationState } from '@tanstack/react-query';
import { useOnline } from '../online.ts';

/**
 * オフライン中の案内。閲覧はキャッシュから続けられ、記録もそのまま行える
 * （送れない書き込みは端末に溜まり、オンラインに戻ったときに送られる。`lib/query-client.ts`）。
 * 文言は「オフラインモード」の一言にとどめる。何ができるかは使えば分かり、毎回読ませる長さではない。
 * 未送信の書き込みがあるときだけ、その件数を添える（送れていないことは見ただけでは分からない）。
 */
export function OfflineBanner() {
  const online = useOnline();
  const queued = useMutationState({ filters: { predicate: (m) => m.state.isPaused } }).length;
  if (online) return null;
  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      オフラインモード
      {queued > 0 && `（未送信 ${queued} 件）`}
    </Alert>
  );
}
