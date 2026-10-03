import CloudOffIcon from '@mui/icons-material/CloudOff';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useMutationState } from '@tanstack/react-query';
import { useOnline } from '../online.ts';
import { useToggle } from './use-toggle.ts';

/**
 * オフライン中の印（見え方と理由は docs/ui.md の「AppBar と検索」）。
 * 未送信の書き込みの件数を読むのはオフラインの間だけにする（オンラインの間は使わない購読を持たない）。
 */
export function OfflineIndicator() {
  return useOnline() ? null : <OfflineIndicatorButton />;
}

/**
 * 色は warning（MUI の Alert の warning のアイコンと同じ `palette.warning.main`）。
 * WHY 押したら開く（onClick）: MUI の Tooltip はタッチでは長押しで開く作りで、enterTouchDelay を 0 にしても
 * 指を離した時点で開く予約が取り消されるため、短いタップでは開かない。閉じるのは Tooltip に任せる
 * （タッチは離して少し後、ポインタは外れたとき）。
 * 未送信の書き込みがあるときだけ、その件数を添える（送れていないことは見ただけでは分からない）。
 */
function OfflineIndicatorButton() {
  const tooltip = useToggle();
  const queued = useMutationState({ filters: { predicate: (m) => m.state.isPaused } }).length;
  const message = `現在オフラインになっています。変更はオンラインになったときに同期されます${queued > 0 ? `（未送信 ${queued} 件）` : ''}`;
  return (
    <Tooltip title={message} open={tooltip.value} onOpen={tooltip.on} onClose={tooltip.off}>
      <IconButton size="small" onClick={tooltip.on}>
        <CloudOffIcon color="warning" />
      </IconButton>
    </Tooltip>
  );
}
