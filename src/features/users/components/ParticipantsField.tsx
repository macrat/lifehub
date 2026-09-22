import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import { useUserColor } from '../use-user-color.ts';
import { useUserLabels } from '../use-user-labels.ts';

/** 選択は入力欄そのものが持つ（送信するときに FormData から読む）。フォームの既定のかたち */
type Uncontrolled = {
  /** 初めから選んでおくユーザー ID。新規作成の既定は `defaultParticipants`（自分だけ） */
  defaultValue: string[];
  value?: never;
  onChange?: never;
};

/** 選択を呼び出し側が持つ。入力の途中でも参加者が要るとき（下書きの枠の色）に使う */
type Controlled = {
  defaultValue?: never;
  value: string[];
  onChange: (participantIds: string[]) => void;
};

type Props = {
  name: string;
  /** 見出し。既定は「参加者」で、選ぶ意味が違うとき（配信 URL に表示する対象者）だけ差し替える */
  label?: string;
  error?: string;
} & (Uncontrolled | Controlled);

/**
 * 参加者の複数選択（ユーザーごとのチェックボックス）。値は FormData から formList で読む。
 * チェックボックスはそのユーザーの色にして、予定の帯や下書きの枠の色と結び付ける。
 */
export function ParticipantsField(props: Props) {
  const { name, label = '参加者', error } = props;
  const { users } = useUserLabels();
  const colorFor = useUserColor();

  /** 選んでいるかどうかの受け渡し。呼び出し側が選択を持つときだけ控える（持たなければ入力欄に任せる） */
  const checkedProps = (userId: string) =>
    props.value === undefined
      ? { defaultChecked: props.defaultValue.includes(userId) }
      : {
          checked: props.value.includes(userId),
          onChange: (_: unknown, checked: boolean) =>
            props.onChange(
              checked
                ? [...props.value, userId]
                : props.value.filter((id: string) => id !== userId),
            ),
        };

  return (
    <FormControl error={Boolean(error)}>
      <FormLabel sx={{ fontSize: '0.75rem' }}>{label}</FormLabel>
      <FormGroup row>
        {users.map((user) => {
          const { fill } = colorFor(user.id);
          return (
            <FormControlLabel
              key={user.id}
              control={
                <Checkbox
                  name={name}
                  value={user.id}
                  {...checkedProps(user.id)}
                  sx={{ color: fill, '&.Mui-checked': { color: fill } }}
                />
              }
              label={user.name}
            />
          );
        })}
      </FormGroup>
      {error && <FormHelperText>{error}</FormHelperText>}
    </FormControl>
  );
}
