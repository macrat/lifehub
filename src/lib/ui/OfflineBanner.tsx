import Alert from '@mui/material/Alert';
import { useOnline } from '../online.ts';

/** オフライン中の案内。閲覧はキャッシュから続けられるが、書き込みはできない。 */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      オフラインです。表示中の内容は最後に取得したものです。記録の追加・変更はオンラインに戻ってから行えます。
    </Alert>
  );
}
