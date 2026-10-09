import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import type { Issued } from '../../../shared/types.ts';
import { copyToClipboard } from './clipboard.ts';
import { Dialog } from './Dialog.tsx';

type Props = {
  /** 読み上げ用のダイアログの名前（「発行した API キー」） */
  label: string;
  /** コピーのボタンの文言（「API キーをコピー」） */
  copy: string;
  /** コピーできたときの知らせ（「API キーをコピーしました」） */
  copied: string;
  /** 発行の応答。見出しに名前を出し、秘密はコピーだけで渡す */
  issued: Issued<{ name: string }>;
  onClose: () => void;
};

/** 発行した秘密を 1 度だけ渡す（docs/architecture.md の「書き込み」の秘密の発行） */
export function IssuedSecretDialog({ label, copy, copied, issued, onClose }: Props) {
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" label={label}>
      <DialogTitle>{issued.item.name}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          コピーできるのは今だけです。閉じる前にコピーしてください。
        </DialogContentText>
        <Button
          variant="contained"
          startIcon={<ContentCopyIcon />}
          onClick={() => copyToClipboard(issued.secret, copied)}
        >
          {copy}
        </Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>閉じる</Button>
      </DialogActions>
    </Dialog>
  );
}
