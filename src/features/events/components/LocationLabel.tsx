import LocationOnIcon from '@mui/icons-material/LocationOnOutlined';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

type Props = {
  location: string;
  /** 1 行に収めて末尾を省略する（行の高さを揃えたい一覧で使う） */
  noWrap?: boolean;
};

/**
 * 場所のアイコンを添えた、予定・タスクの場所。詳細とホームのタイムラインで同じ見た目にする。
 * リンクにするかは使う側が決める（押せる行の中にはリンクを入れられないため）
 */
export function LocationLabel({ location, noWrap = false }: Props) {
  return (
    <Stack
      component="span"
      direction="row"
      spacing={0.5}
      sx={{ alignItems: 'center', color: 'text.secondary' }}
    >
      <LocationOnIcon fontSize="small" />
      <Typography variant="body2" component="span" noWrap={noWrap}>
        {location}
      </Typography>
    </Stack>
  );
}
