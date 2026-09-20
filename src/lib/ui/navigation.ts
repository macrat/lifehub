import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import HomeIcon from '@mui/icons-material/Home';
import PaymentsIcon from '@mui/icons-material/Payments';
import SettingsIcon from '@mui/icons-material/Settings';
import SpaIcon from '@mui/icons-material/Spa';
import type { LinkProps } from '@tanstack/react-router';
import type { ComponentType } from 'react';

export type NavItem = {
  label: string;
  to: LinkProps['to'];
  icon: ComponentType;
  /** true なら PC のサイドナビにだけ出す（スマホの下部ナビには出さず、ホームの末尾から開く） */
  desktopOnly?: boolean;
};

/** 主要画面。スマホでは下部ナビ、PC ではサイドナビに並ぶ。新しい機能の画面はここに 1 行足す。 */
export const primaryNavItems: NavItem[] = [
  { label: 'ホーム', to: '/', icon: HomeIcon },
  { label: '予定', to: '/calendar', icon: CalendarMonthIcon },
  { label: '立替', to: '/expenses', icon: PaymentsIcon },
  { label: 'レモン', to: '/lemon', icon: SpaIcon },
  { label: '設定', to: '/settings', icon: SettingsIcon, desktopOnly: true },
];

/** スマホの下部ナビに出す項目 */
export const bottomNavItems: NavItem[] = primaryNavItems.filter((item) => !item.desktopOnly);

/** 設定（スマホではホームの末尾から開く） */
export const settingsNavItem = primaryNavItems.find((item) => item.to === '/settings') as NavItem;
