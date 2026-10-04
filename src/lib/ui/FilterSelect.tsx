import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { ALL, optionOrUndefined } from '../search.ts';

type Props<T extends string> = {
  label: string;
  /** 選んでいる値。undefined は「すべて」（絞り込まない） */
  value: T | undefined;
  /** 「すべて」の下に並べる選択肢 */
  options: readonly { value: T; label: string }[];
  onChange: (value: T | undefined) => void;
};

/**
 * 絞り込みのフォーム（`FilterPanel`）の選択欄。先頭に「すべて」を置き、選ぶと絞り込みをやめる
 * （「すべて」は値として URL に残さない。`optionOrUndefined`）。
 */
export function FilterSelect<T extends string>({ label, value, options, onChange }: Props<T>) {
  return (
    <TextField
      label={label}
      select
      size="small"
      value={value ?? ALL}
      onChange={(e) => onChange(optionOrUndefined<T>(e.target.value))}
    >
      <MenuItem value={ALL}>すべて</MenuItem>
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}
