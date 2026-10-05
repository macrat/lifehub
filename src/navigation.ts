import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import HomeIcon from '@mui/icons-material/Home';
import SettingsIcon from '@mui/icons-material/Settings';
import { widerSearch } from './features/calendar/view.ts';
import { ADD_KINDS } from './lib/add-kinds.ts';
import type { NavItem } from './lib/ui/nav-item.ts';

/** 設定（PC のサイドナビにだけ出し、スマホではホームの AppBar の歯車から開く） */
export const settingsNavItem: NavItem = {
  label: '設定',
  to: '/settings',
  icon: SettingsIcon,
  desktopOnly: true,
};

/** カレンダー。PWA のショートカットのアイコンも同じ物を使うので、名前を付けて出す */
export const calendarNavItem: NavItem = {
  label: '予定',
  to: '/calendar',
  icon: CalendarMonthIcon,
  reselectSearch: widerSearch,
};

/**
 * 主要画面。スマホでは下部ナビ、PC ではサイドナビに並ぶ（`AppShell`）。新しい機能の画面はここに 1 行足す。
 * 並べるのは各機能の画面なので、機能を読めない lib ではなくここ（アプリの組み立て）に置く。
 * 記録の種類 1 つの画面（立替・レモン）は、その種類の絵（`ADD_KINDS`）をそのまま使う（タイムラインの丸と同じ絵になる）。
 */
export const primaryNavItems: NavItem[] = [
  { label: 'ホーム', to: '/', icon: HomeIcon },
  calendarNavItem,
  { label: '立替', to: '/expenses', icon: ADD_KINDS.expense.icon },
  { label: 'レモン', to: '/lemon', icon: ADD_KINDS.lemon.icon },
  settingsNavItem,
];
