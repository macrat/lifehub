import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import { useUserLabels } from '../use-user-labels.ts';

type Props = {
  name: string;
  /** 選択済みのユーザー ID。空なら全員を選んだ状態で始める（新規作成の既定） */
  defaultValue: string[];
  error?: string;
};

/** 参加者の複数選択（ユーザーごとのチェックボックス）。値は FormData から formList で読む */
export function ParticipantsField({ name, defaultValue, error }: Props) {
  const { users } = useUserLabels();
  return (
    <FormControl error={Boolean(error)}>
      <FormLabel sx={{ fontSize: '0.75rem' }}>参加者</FormLabel>
      <FormGroup row>
        {users.map((user) => (
          <FormControlLabel
            key={user.id}
            control={
              <Checkbox
                name={name}
                value={user.id}
                defaultChecked={defaultValue.length === 0 || defaultValue.includes(user.id)}
              />
            }
            label={user.name}
          />
        ))}
      </FormGroup>
      {error && <FormHelperText>{error}</FormHelperText>}
    </FormControl>
  );
}
