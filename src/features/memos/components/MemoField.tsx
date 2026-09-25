import TextField from '@mui/material/TextField';
import { MEMO_MAX_LENGTH } from '../../../../shared/validation/memos.ts';

type Props = {
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
};

/**
 * メモの本文の入力欄。上限（`MEMO_MAX_LENGTH`）を超えては打てず、下に今の文字数を出す。
 * 追加と編集が同じものを使う。
 *
 * 追加でも編集でも、出た所からそのまま打てるように焦点を当てる。この欄は書き始めたとき
 * （追加のシートを開いた・詳細を編集に切り替えた）にだけマウントされるので、autoFocus で足りる。
 * 項目がこの欄だけなので、書き始めたなら次に打つのは必ず本文だと分かる。
 */
export function MemoField({ value, onChange, error }: Props) {
  return (
    <TextField
      name="body"
      label="メモ"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      multiline
      minRows={3}
      autoFocus
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
