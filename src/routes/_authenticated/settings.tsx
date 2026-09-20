import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import LogoutIcon from '@mui/icons-material/Logout';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { hueColor } from '../../../shared/color.ts';
import { HueSlider } from '../../features/users/components/HueSlider.tsx';
import { useUpdateUser } from '../../features/users/queries.ts';
import { meQueryOptions, useLogout } from '../../lib/auth.ts';
import {
  isStandalone,
  pushSupported,
  usePushStatus,
  useSubscribePush,
  useUnsubscribePush,
} from '../../lib/push.ts';

export const Route = createFileRoute('/_authenticated/settings')({
  component: SettingsPage,
});

const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

/**
 * 設定。Google 系アプリの設定画面と同じ「見出し + 行」の並び。
 * 自分の色（アクセントカラー）、この端末のプッシュ通知、ユーザー管理、ログアウト。
 */
function SettingsPage() {
  const { data: me } = useQuery(meQueryOptions);
  const logout = useLogout();
  return (
    <>
      <MyColorSection hue={me?.hue ?? 0} name={me?.name ?? ''} />
      <PushSection />
      <List
        subheader={
          <ListSubheader component="h3" disableSticky>
            アカウント
          </ListSubheader>
        }
      >
        <ListItem disablePadding>
          <ListItemButton component={Link} to="/admin/users">
            <ListItemIcon>
              <AdminPanelSettingsIcon />
            </ListItemIcon>
            <ListItemText
              primary="ユーザー管理"
              secondary="ユーザーの登録、名前・色・パスワードの変更"
            />
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton onClick={() => void logout()}>
            <ListItemIcon>
              <LogoutIcon />
            </ListItemIcon>
            <ListItemText primary="ログアウト" secondary={me?.email} />
          </ListItemButton>
        </ListItem>
      </List>
    </>
  );
}

/** 自分の色。スライダーを離した時点で保存し、アクセントカラーが即座に変わる */
function MyColorSection({ hue, name }: { hue: number; name: string }) {
  const { data: me } = useQuery(meQueryOptions);
  const update = useUpdateUser();
  const [value, setValue] = useState(hue);
  useEffect(() => setValue(hue), [hue]);
  const dark = useMediaQuery('(prefers-color-scheme: dark)');
  return (
    <List
      subheader={
        <ListSubheader component="h3" disableSticky>
          自分の色
        </ListSubheader>
      }
    >
      <ListItem>
        <ListItemAvatar>
          <Avatar sx={{ bgcolor: hueColor(value, 'fill', dark ? 'dark' : 'light') }}>
            {name.slice(0, 1)}
          </Avatar>
        </ListItemAvatar>
        <ListItemText
          primary={name}
          secondary="ボタンや選択の色と、カレンダーで自分の予定・タスクに付く色"
        />
      </ListItem>
      <Stack sx={{ px: 2, pb: 1 }}>
        <HueSlider
          value={value}
          onChange={setValue}
          onCommit={(v) => me && update.mutate({ id: me.id, hue: v })}
        />
        {update.error && <Alert severity="error">{update.error.message}</Alert>}
      </Stack>
    </List>
  );
}

function PushSection() {
  const status = usePushStatus();
  const subscribe = useSubscribePush();
  const unsubscribe = useUnsubscribePush();
  const subscribed = status.data?.subscribed ?? false;
  const denied = status.data?.permission === 'denied';
  const busy = subscribe.isPending || unsubscribe.isPending || (status.isPending && pushSupported);
  const error = subscribe.error ?? unsubscribe.error;

  return (
    <List
      subheader={
        <ListSubheader component="h3" disableSticky>
          プッシュ通知
        </ListSubheader>
      }
    >
      <ListItem
        secondaryAction={
          <Switch
            edge="end"
            checked={subscribed}
            disabled={!pushSupported || denied || busy}
            onChange={(_, checked) => (checked ? subscribe.mutate() : unsubscribe.mutate())}
            slotProps={{ input: { 'aria-label': 'この端末で通知を受け取る' } }}
          />
        }
      >
        <ListItemText
          // secondaryAction の既定の余白（48px）ではスイッチ（58px）と説明文が重なる
          sx={{ pr: 5 }}
          primary="この端末で通知を受け取る"
          secondary="予定の開始前と、タスクの開始日時・期限日時に通知します。端末ごとに設定します。"
        />
      </ListItem>
      <Stack spacing={1} sx={{ px: 2, pt: 1 }}>
        {!pushSupported && (
          <Alert severity="warning">このブラウザはプッシュ通知に対応していません。</Alert>
        )}
        {pushSupported && isIOS && !isStandalone() && (
          <Alert severity="info">
            iPhone / iPad
            では、共有メニューから「ホーム画面に追加」したアプリでのみ通知を受け取れます。
          </Alert>
        )}
        {denied && (
          <Alert severity="warning">
            通知がブロックされています。ブラウザの設定で許可してください。
          </Alert>
        )}
        {error && <Alert severity="error">{error.message}</Alert>}
      </Stack>
    </List>
  );
}
