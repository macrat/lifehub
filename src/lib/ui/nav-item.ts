import type { LinkProps } from '@tanstack/react-router';
import type { ComponentType } from 'react';

/** ナビ（スマホの下部ナビ・PC のサイドナビ）の項目 */
export type NavItem = {
  label: string;
  to: LinkProps['to'];
  icon: ComponentType;
  /**
   * その画面を見ているときにもう一度押したときの検索パラメータ（今の物から作る）。
   * 無いとき・ほかの画面から来たときは付けない（その画面の既定で開く）
   */
  reselectSearch?: LinkProps['search'];
  /** true なら PC のサイドナビにだけ出す（スマホの下部ナビには出さず、ホームの末尾から開く） */
  desktopOnly?: boolean;
};
