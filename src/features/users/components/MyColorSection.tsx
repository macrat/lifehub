import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Stack from '@mui/material/Stack';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { hueColor } from '../../../../shared/color.ts';
import { meQueryOptions } from '../../../lib/auth.ts';
import { useColorMode } from '../../../lib/theme.ts';
import { useUpdateUser } from '../queries.ts';
import { HueSlider } from './HueSlider.tsx';

/** 色。スライダーを離した時点で保存し、アクセントカラーが即座に変わる。ドラッグ中の値だけをローカルに持ち、保存後はサーバーの値に戻す */
export function MyColorSection() {
  const { data: me } = useQuery(meQueryOptions);
  const update = useUpdateUser();
  const [draft, setDraft] = useState<number | null>(null);
  const mode = useColorMode();
  const value = draft ?? me?.hue ?? 0;
  const name = me?.name ?? '';
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
      <Stack sx={{ px: 2, pb: 1 }}>
        <HueSlider
          value={value}
          onChange={setDraft}
          onCommit={(v) =>
            me && update.mutate({ id: me.id, hue: v }, { onSettled: () => setDraft(null) })
          }
        />
        {update.error && <Alert severity="error">{update.error.message}</Alert>}
      </Stack>
    </List>
  );
}
