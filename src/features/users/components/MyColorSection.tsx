import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Stack from '@mui/material/Stack';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { DEFAULT_HUE, hueColor } from '../../../../shared/color.ts';
import { meQueryOptions } from '../../../lib/auth.ts';
import { previewHue, useColorMode, usePreviewHue } from '../../../lib/theme.ts';
import { useUpdateUser } from '../queries.ts';
import { HueSlider } from './HueSlider.tsx';

/**
 * 色。スライダーを動かすと選んだ色がその場でアプリ全体のアクセントカラーになり、下のスイッチや
 * 上のインジケータで実際の見え方を確かめてから決められる。選んでいる最中の色はテーマが持つ
 * （`lib/theme.ts`）ので、この画面は表示と保存だけを行う。
 *
 * 保存は保存ボタンを押したときだけ。スライダーを離した時点では送らない（見比べている途中の色が
 * そのたびに保存されてしまい、他の端末や他のユーザーの画面にも出てしまう）。
 * 保存せずに設定画面を離れれば、選んでいた色は捨てて元の色に戻る。保存に失敗したときは通知が出て
 * （`useOptimisticMutation`）、選んだ色はそのまま残るので押し直せる。
 */
export function MyColorSection() {
  const { data: me } = useQuery(meQueryOptions);
  const update = useUpdateUser();
  const mode = useColorMode();
  const preview = usePreviewHue();

  // 設定画面を離れたら、保存していない色は捨てる
  useEffect(() => () => previewHue(null), []);

  const value = preview ?? me?.hue ?? DEFAULT_HUE;
  const name = me?.name ?? '';
  // 保存すると me.hue が先に書き換わる（楽観的更新）ので、保存した時点でボタンは押せなくなる
  const changed = me != null && value !== me.hue;

  return (
    <List
      subheader={
        <ListSubheader component="h3" disableSticky>
          色
        </ListSubheader>
      }
    >
      <ListItem>
        <ListItemAvatar>
          <Avatar sx={{ bgcolor: hueColor(value, 'fill', mode) }}>{name.slice(0, 1)}</Avatar>
        </ListItemAvatar>
        <ListItemText
          primary={name}
          secondary="ボタンや選択の色と、カレンダーでこのユーザーの予定・タスクに付く色"
        />
      </ListItem>
      <Stack spacing={1} sx={{ px: 2, pb: 1 }}>
        <HueSlider value={value} onChange={previewHue} />
        <Button
          variant="contained"
          disabled={!changed}
          onClick={() => me && update.mutate({ id: me.id, hue: value })}
          sx={{ alignSelf: 'flex-end' }}
        >
          保存
        </Button>
      </Stack>
    </List>
  );
}
