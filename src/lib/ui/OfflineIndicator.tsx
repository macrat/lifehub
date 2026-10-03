import AirplanemodeActiveIcon from '@mui/icons-material/AirplanemodeActive';
import Tooltip from '@mui/material/Tooltip';
import { useMutationState } from '@tanstack/react-query';
import { useOnline } from '../online.ts';

/**
 * オフライン中の印。AppBar の左端に機内モードのアイコンを出し、説明はツールチップにだけ置く。
 * 閲覧はキャッシュから続けられ、記録もそのまま行える（送れない書き込みは端末に溜まり、オンラインに
 * 戻ったときに送られる。`lib/query-client.ts`）ので、オフラインであることは知らせても画面の場所は取らない。
 * 色は warning（MUI の Alert の warning のアイコンと同じ `palette.warning.main`）。
 * WHY enterTouchDelay={0}: 既定ではスマホは長押しでしか出ない。押してすぐ読めるようにする。
 * 未送信の書き込みがあるときだけ、その件数を添える（送れていないことは見ただけでは分からない）。
 */
export function OfflineIndicator() {
  const online = useOnline();
  const queued = useMutationState({ filters: { predicate: (m) => m.state.isPaused } }).length;
  if (online) return null;
  const message = `現在オフラインになっています。変更はオンラインになったときに同期されます${queued > 0 ? `（未送信 ${queued} 件）` : ''}`;
  return (
    <Tooltip title={message} enterTouchDelay={0}>
      <AirplanemodeActiveIcon color="warning" role="img" aria-hidden={false} sx={{ mx: 0.5 }} />
    </Tooltip>
  );
}
