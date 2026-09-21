import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import LogoutIcon from '@mui/icons-material/Logout';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PushSection } from '../../features/push/components/PushSection.tsx';
import { MyColorSection } from '../../features/users/components/MyColorSection.tsx';
import { meQueryOptions, useLogout } from '../../lib/auth.ts';
import { formatDateWithYear, formatTime } from '../../lib/date.ts';

export const Route = createFileRoute('/_authenticated/settings')({
  component: SettingsPage,
});

/**
 * 設定。Google 系アプリの設定画面と同じ「見出し + 行」の並び。
 * 自分の色（アクセントカラー）、この端末のプッシュ通知、ユーザー管理、ログアウト、バージョン。
 */
function SettingsPage() {
  const { data: me } = useQuery(meQueryOptions);
  const logout = useLogout();
  return (
    <>
      <MyColorSection />
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
      <VersionSection />
    </>
  );
}

/**
 * バージョン。バグに出くわしたとき、どのビルドを見ているかを言えるようにする。
 * コミットは先頭 7 桁だけ出す（このリポジトリで一意に定まり、読み上げも写しもできる長さ）。
 */
function VersionSection() {
  return (
    <List
      subheader={
        <ListSubheader component="h3" disableSticky>
          バージョン
        </ListSubheader>
      }
    >
      <ListItem>
        <ListItemText
          primary={__BUILD_COMMIT__.slice(0, 7)}
          secondary={`${formatDateWithYear(__BUILD_TIME__)} ${formatTime(__BUILD_TIME__)}`}
        />
      </ListItem>
    </List>
  );
}
