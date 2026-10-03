import AirplanemodeActiveIcon from '@mui/icons-material/AirplanemodeActive';
import Tooltip from '@mui/material/Tooltip';
import { useMutationState } from '@tanstack/react-query';
import { useOnline } from '../online.ts';
import { useToggle } from './use-toggle.ts';

/**
 * オフライン中の印。AppBar の左端に機内モードのアイコンを出し、説明はツールチップにだけ置く。
 * 閲覧はキャッシュから続けられ、記録もそのまま行える（送れない書き込みは端末に溜まり、オンラインに
 * 戻ったときに送られる。`lib/query-client.ts`）ので、オフラインであることは知らせても画面の場所は取らない。
 * 色は warning（MUI の Alert の warning のアイコンと同じ `palette.warning.main`）。
 * WHY 押したら開く（onClick）: MUI の Tooltip はタッチでは長押しで開く作りで、enterTouchDelay を 0 にしても
 * 指を離した時点で開く予約が取り消されるため、短いタップでは開かない。閉じるのは Tooltip に任せる
 * （タッチは離して少し後、ポインタは外れたとき）。
 * 未送信の書き込みがあるときだけ、その件数を添える（送れていないことは見ただけでは分からない）。
 */
export function OfflineIndicator() {
  const online = useOnline();
  const tooltip = useToggle();
  const queued = useMutationState({ filters: { predicate: (m) => m.state.isPaused } }).length;
  if (online) return null;
  const message = `現在オフラインになっています。変更はオンラインになったときに同期されます${queued > 0 ? `（未送信 ${queued} 件）` : ''}`;
  return (
    <Tooltip title={message} open={tooltip.value} onOpen={tooltip.on} onClose={tooltip.off}>
      <AirplanemodeActiveIcon
        color="warning"
        role="img"
        aria-hidden={false}
        onClick={tooltip.on}
        sx={{ mx: 0.5 }}
      />
    </Tooltip>
  );
}
