import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import { copyToClipboard } from './clipboard.ts';

type Props = {
  label: string;
  value: string;
  /** コピーできたときの知らせ */
  copied: string;
};

/**
 * 編集できない値の欄。欄のどこを押してもコピーする（写すための欄なので、選択より写すことを優先する）。
 * 右のボタンは同じ操作をキーボードや読み上げからも届くようにするためのもので、押すと欄まで伝わってコピーする
 * （ボタン自身にも付けると 2 回写す）。
 * `name` を付けないので、フォームの中に置いてもフォームの値には入らない。
 */
export function CopyField({ label, value, copied }: Props) {
  return (
    <TextField
      label={label}
      value={value}
      onClick={() => copyToClipboard(value, copied)}
      fullWidth
      slotProps={{
        input: {
          readOnly: true,
          sx: { fontFamily: 'monospace', '&, & input': { cursor: 'pointer' } },
          endAdornment: (
            <InputAdornment position="end">
              <IconButton edge="end" aria-label={`${label} をコピー`}>
                <ContentCopyIcon />
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
