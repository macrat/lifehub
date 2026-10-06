import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { AppBarContent } from './app-bar-slot.tsx';
import { BackButton } from './BackButton.tsx';

/**
 * 下部ナビに置かず、ほかの画面から開く画面（天気、設定から開く管理の画面）の AppBar: 左に戻るボタン、その右に画面の名前。
 * 画面の操作（children）は右端に並べる。fallback はアプリの中から来たのでなければ戻る先（`useGoBack`）
 */
export function SubPageBar({
  title,
  fallback,
  children,
}: {
  title: string;
  fallback?: string;
  children?: ReactNode;
}) {
  return (
    <AppBarContent>
      <BackButton fallback={fallback} />
      <Typography component="h1" variant="subtitle1" noWrap sx={{ flexGrow: 1 }}>
        {title}
      </Typography>
      {children}
    </AppBarContent>
  );
}
