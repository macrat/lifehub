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
};

/** 主要画面。スマホでは下部ナビ、PC ではサイドナビに並ぶ。新しい機能の画面はここに 1 行足す。 */
export const primaryNavItems: NavItem[] = [
  { label: 'ホーム', to: '/', icon: HomeIcon },
  { label: 'カレンダー', to: '/calendar', icon: CalendarMonthIcon },
  { label: '立替', to: '/expenses', icon: PaymentsIcon },
  { label: 'レモン', to: '/lemon', icon: SpaIcon },
  { label: '設定', to: '/settings', icon: SettingsIcon },
];
