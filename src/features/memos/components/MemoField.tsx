import TextField from '@mui/material/TextField';
import { MEMO_MAX_LENGTH } from '../../../../shared/validation/memos.ts';

type Props = {
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  /** 開いた所からそのまま打てるようにするか（追加だけ） */
  autoFocus?: boolean;
};

/**
 * メモの本文の入力欄。上限（`MEMO_MAX_LENGTH`）を超えては打てず、下に今の文字数を出す。
 * 追加と編集が同じものを使う。
 */
export function MemoField({ value, onChange, error, autoFocus = false }: Props) {
  return (
    <TextField
      name="body"
      label="メモ"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      multiline
      minRows={3}
      autoFocus={autoFocus}
      error={Boolean(error)}
      helperText={error ?? `${value.length} / ${MEMO_MAX_LENGTH}`}
      slotProps={{
        htmlInput: { maxLength: MEMO_MAX_LENGTH },
        formHelperText: { sx: { textAlign: 'right' } },
      }}
      fullWidth
    />
  );
}
