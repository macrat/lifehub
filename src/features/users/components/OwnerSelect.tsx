import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { SELECT_NONE } from '../../../lib/form.ts';
import { useOwnerLabel } from '../use-owner-label.ts';

type Props = {
  name: string;
  label: string;
  /** null は共有 */
  defaultValue: string | null;
};

/** 所有者・担当者の選択（共有／各ユーザー）。値は FormData から formSelect で読む */
export function OwnerSelect({ name, label, defaultValue }: Props) {
  const { options } = useOwnerLabel();
  return (
    <TextField
      name={name}
      label={label}
      select
      defaultValue={defaultValue ?? SELECT_NONE}
      fullWidth
    >
      {options.map((o) => (
        <MenuItem key={o.value ?? SELECT_NONE} value={o.value ?? SELECT_NONE}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
  );
}
