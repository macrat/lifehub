import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { copyToClipboard } from './clipboard.ts';
import { Dialog } from './Dialog.tsx';

type Props = {
  /** 読み上げ用のダイアログの名前（「発行した API キー」） */
  label: string;
  /** コピーのボタンの文言（「API キーをコピー」） */
  copy: string;
  /** コピーできたときの知らせ（「API キーをコピーしました」） */
  copied: string;
  /** 発行したものの名前（見出し） */
  name: string;
  /** 発行した秘密そのもの */
  secret: string;
  onClose: () => void;
};

/**
 * 発行した秘密（API キー、配信 URL）を 1 度だけ渡す。サーバーはハッシュしか持たないので、閉じたら二度と出せない。
 * 字面は出さず、コピーのボタンだけを置く。長い乱数で画面で読む意味が無く、写すのではなく貼るものなので。
 */
export function IssuedSecretDialog({ label, copy, copied, name, secret, onClose }: Props) {
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" label={label}>
      <DialogTitle>{name}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          コピーできるのは今だけです。閉じる前にコピーしてください。
        </DialogContentText>
        <Button
          variant="contained"
          startIcon={<ContentCopyIcon />}
          onClick={() => copyToClipboard(secret, copied)}
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
