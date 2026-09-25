import TextField from '@mui/material/TextField';
import { MEMO_MAX_LENGTH } from '../../../../shared/validation/memos.ts';

type Props = {
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  /** 開いた所からそのまま打てるようにするか（追加だけ） */
  autoFocus?: boolean;
  /** 枠の見出しを出さず、空のときの案内だけにする（PC の入力欄。何を書く所かは置き場所が示す） */
  placeholder?: string;
  /** 最初の高さ（行数）。打てば伸びる */
  minRows?: number;
};

/**
 * メモの本文の入力欄。上限（`MEMO_MAX_LENGTH`）を超えては打てず、下に今の文字数を出す。
 * 追加・編集・PC の入力欄が同じものを使う。
 */
export function MemoField({
  value,
  onChange,
  error,
  autoFocus = false,
  placeholder,
  minRows = 3,
}: Props) {
  return (
    <TextField
      name="body"
      label={placeholder ? undefined : 'メモ'}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      multiline
      minRows={minRows}
      autoFocus={autoFocus}
      error={Boolean(error)}
      helperText={error ?? `${value.length} / ${MEMO_MAX_LENGTH}`}
      slotProps={{
        htmlInput: { maxLength: MEMO_MAX_LENGTH, 'aria-label': placeholder },
        formHelperText: { sx: { textAlign: 'right' } },
      }}
      fullWidth
    />
  );
}
