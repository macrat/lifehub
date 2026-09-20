import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import HomeIcon from '@mui/icons-material/Home';
import ListAltIcon from '@mui/icons-material/ListAlt';
import PaymentsIcon from '@mui/icons-material/Payments';
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
  { label: 'イベント', to: '/events', icon: ListAltIcon },
  { label: '立替', to: '/expenses', icon: PaymentsIcon },
  { label: 'レモン', to: '/lemon', icon: SpaIcon },
];

/** 補助画面。右上のアカウントメニューから開く。 */
export const secondaryNavItems: { label: string; to: LinkProps['to'] }[] = [
  { label: '設定', to: '/settings' },
  { label: 'ユーザー管理', to: '/admin/users' },
];
