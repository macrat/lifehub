import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { CopyField } from '../../../lib/ui/CopyField.tsx';
import { Dialog } from '../../../lib/ui/Dialog.tsx';
import type { IssuedApiKey } from '../queries.ts';

type Props = {
  apiKey: IssuedApiKey;
  onClose: () => void;
};

/**
 * 発行した API キーを 1 度だけ見せる。サーバーはキーのハッシュしか持たないので、閉じたら二度と出せない。
 * 字面も出すのは、コピーした先（パソコンのエディタ）とこの画面が別の端末のことがあり、写して打つ場合もあるため。
 */
export function IssuedApiKeyDialog({ apiKey, onClose }: Props) {
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" label="発行した API キー">
      <DialogTitle>{apiKey.name}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          このキーは今だけ表示されます。閉じる前にコピーしてください。
        </DialogContentText>
        <CopyField label="API キー" value={apiKey.key} copied="API キーをコピーしました" />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>閉じる</Button>
      </DialogActions>
    </Dialog>
  );
}
