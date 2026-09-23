import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import HomeIcon from '@mui/icons-material/Home';
import PaymentsIcon from '@mui/icons-material/Payments';
import SettingsIcon from '@mui/icons-material/Settings';
import SpaIcon from '@mui/icons-material/Spa';
import type { LinkProps } from '@tanstack/react-router';
import type { ComponentType } from 'react';
import { calendarNavSearch } from '../../features/calendar/view.ts';

export type NavItem = {
  label: string;
  to: LinkProps['to'];
  icon: ComponentType;
  /** 移動先の検索パラメータ（関数なら今見ている画面の物から作る）。無ければ付けない（その画面の既定で開く） */
  search?: LinkProps['search'];
  /** true なら PC のサイドナビにだけ出す（スマホの下部ナビには出さず、ホームの末尾から開く） */
  desktopOnly?: boolean;
};

/** 設定（PC のサイドナビにだけ出し、スマホではホームの末尾から開く） */
export const settingsNavItem: NavItem = {
  label: '設定',
  to: '/settings',
  icon: SettingsIcon,
  desktopOnly: true,
};

/**
 * カレンダー。PWA のショートカットのアイコンも同じ物を使うので、名前を付けて出す。
 * カレンダーを見ているときに押すと一段広い表示へ移る（`calendarNavSearch`）
 */
export const calendarNavItem: NavItem = {
  label: '予定',
  to: '/calendar',
  icon: CalendarMonthIcon,
  search: calendarNavSearch,
};

/** 主要画面。スマホでは下部ナビ、PC ではサイドナビに並ぶ。新しい機能の画面はここに 1 行足す。 */
export const primaryNavItems: NavItem[] = [
  { label: 'ホーム', to: '/', icon: HomeIcon },
  calendarNavItem,
  { label: '立替', to: '/expenses', icon: PaymentsIcon },
  { label: 'レモン', to: '/lemon', icon: SpaIcon },
  settingsNavItem,
];

/** スマホの下部ナビに出す項目 */
export const bottomNavItems: NavItem[] = primaryNavItems.filter((item) => !item.desktopOnly);
