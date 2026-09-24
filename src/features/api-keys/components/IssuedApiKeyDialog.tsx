import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import { copyToClipboard } from '../../../lib/ui/clipboard.ts';
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
        <TextField
          label="API キー"
          value={apiKey.key}
          fullWidth
          slotProps={{
            input: {
              readOnly: true,
              sx: { fontFamily: 'monospace' },
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    edge="end"
                    aria-label="API キーをコピー"
                    onClick={() => copyToClipboard(apiKey.key, 'API キーをコピーしました')}
                  >
                    <ContentCopyIcon />
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>閉じる</Button>
      </DialogActions>
    </Dialog>
  );
}
