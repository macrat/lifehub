import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import LogoutIcon from '@mui/icons-material/Logout';
import RefreshIcon from '@mui/icons-material/Refresh';
import RuleIcon from '@mui/icons-material/Rule';
import IconButton from '@mui/material/IconButton';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ApiKeyList } from '../../features/api-keys/components/ApiKeyList.tsx';
import { apiKeysQueryOptions } from '../../features/api-keys/queries.ts';
import { CalendarFeedList } from '../../features/calendar-feeds/components/CalendarFeedList.tsx';
import { calendarFeedsQueryOptions } from '../../features/calendar-feeds/queries.ts';
import { McpClientList } from '../../features/mcp-clients/components/McpClientList.tsx';
import { mcpClientsQueryOptions } from '../../features/mcp-clients/queries.ts';
import { PushSection } from '../../features/push/components/PushSection.tsx';
import { pushStatusQueryOptions, pushSupported } from '../../features/push/queries.ts';
import { AllDayNotifySection } from '../../features/users/components/AllDayNotifySection.tsx';
import { MyColorSection } from '../../features/users/components/MyColorSection.tsx';
import { meQueryOptions, useLogout } from '../../lib/auth.ts';
import { formatDateWithYear, formatTime } from '../../lib/date.ts';
import { useScreenQueries, useStoreQuery } from '../../lib/screen-data.ts';
import { SettingsSection } from '../../lib/ui/SettingsSection.tsx';
import { useUpdateApp } from '../../lib/update.ts';

export const Route = createFileRoute('/_authenticated/settings')({
  // 引いて取り直したい内容を持たず、上端に指で動かす操作（色のスライダー）が並ぶので、引っ張って更新はしない
  staticData: { noPullToRefresh: true },
  component: SettingsPage,
});

/**
 * 設定。Google 系アプリの設定画面と同じ「見出し + 行」の並び（`SettingsSection`）。
 * 自分の色（アクセントカラー）、この端末のプッシュ通知、終日の通知時刻、外部連携（カレンダーの配信 URL・API キー・MCP クライアント）、
 * 取り込みルールと立替スケジュール、ユーザー管理、ログアウト、バージョン。
 */
function SettingsPage() {
  // この画面が読むもの: 配信 URL・API キー・MCP クライアントの一覧、この端末のプッシュ通知の購読（対応するブラウザだけ）
  useScreenQueries([
    calendarFeedsQueryOptions,
    apiKeysQueryOptions,
    mcpClientsQueryOptions,
    { ...pushStatusQueryOptions, enabled: pushSupported },
  ]);
  const { data: me } = useStoreQuery(meQueryOptions);
  const logout = useLogout();
  return (
    <>
      <MyColorSection />
      <PushSection />
      <AllDayNotifySection />
      {/* 外の仕組みに渡したアクセス（読むための配信 URL、書くための API キー、MCP クライアントへの許可）を 1 か所にまとめる */}
      <SettingsSection title="外部連携">
        <CalendarFeedList />
        <ApiKeyList />
        <McpClientList />
      </SettingsSection>
      <SettingsSection title="お金">
        <ListItem disablePadding>
          <ListItemButton component={Link} to="/admin/money-rules">
            <ListItemIcon>
              <RuleIcon />
            </ListItemIcon>
            <ListItemText primary="取り込みルール" />
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton component={Link} to="/admin/expense-schedules">
            <ListItemIcon>
              <EventRepeatIcon />
            </ListItemIcon>
            <ListItemText primary="立替スケジュール" />
          </ListItemButton>
        </ListItem>
      </SettingsSection>
      <SettingsSection title="アカウント">
        <ListItem disablePadding>
          <ListItemButton component={Link} to="/admin/users">
            <ListItemIcon>
              <AdminPanelSettingsIcon />
            </ListItemIcon>
            <ListItemText primary="ユーザー管理" />
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
      </SettingsSection>
      <VersionSection />
    </>
  );
}

/**
 * バージョン。バグに出くわしたとき、どのビルドを見ているかを言えるようにする。
 * コミットは先頭 7 桁だけ出す（このリポジトリで一意に定まり、読み上げも写しもできる長さ）。
 * 右の更新ボタンは、表示中の版が古いと分かったときの逃げ道（`src/lib/update.ts`）。
 */
function VersionSection() {
  const { updating, update } = useUpdateApp();
  return (
    <SettingsSection title="バージョン">
      <ListItem
        secondaryAction={
          <IconButton edge="end" aria-label="最新版に更新" loading={updating} onClick={update}>
            <RefreshIcon />
          </IconButton>
        }
      >
        <ListItemText
          primary={__BUILD_COMMIT__.slice(0, 7)}
          secondary={`${formatDateWithYear(__BUILD_TIME__)} ${formatTime(__BUILD_TIME__)}`}
        />
      </ListItem>
    </SettingsSection>
  );
}
